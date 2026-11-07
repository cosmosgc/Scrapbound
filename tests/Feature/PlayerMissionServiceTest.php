<?php

namespace Tests\Feature;

use App\Models\PlayerMissionRun;
use App\Models\User;
use App\Services\GameCatalog;
use App\Services\MissionResolver;
use App\Services\PlayerMissionService;
use Database\Seeders\BrainTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PlayerMissionServiceTest extends TestCase
{
    use RefreshDatabase;

    private function player(): User
    {
        $this->seed(BrainTemplateSeeder::class);

        return User::create(['username' => 'MissionPilot', 'password' => 'safe-example-password']);
    }

    private function seedForOutcome(bool $success): int
    {
        $resolver = app(MissionResolver::class);
        $catalog = app(GameCatalog::class)->active();
        $crew = [[
            'id' => 0, 'kind' => 'scavenger', 'program_version' => 1,
            'program' => [['action' => 'patrol'], ['action' => 'scan'], ['action' => 'collect', 'resource' => 'credits']],
        ]];
        for ($seed = 1; $seed <= 1000; $seed++) {
            $result = $resolver->resolve($seed, 1, $crew, $catalog['rewards'], $catalog['missionRules'], 23);
            if ($result['success'] === $success) {
                return $seed;
            }
        }
        $this->fail('Expected deterministic mission outcome seed was not found.');
    }

    public function test_server_requires_a_programmed_owned_roster_and_starts_bounded_mission(): void
    {
        $user = $this->player();
        $service = app(PlayerMissionService::class);
        $overview = $service->overview($user);
        $this->assertSame(1, $overview['unlocked_sector']);
        $this->assertSame(1, $overview['crew_count']);
        $this->assertSame(23, $overview['contracts'][0]['duration_seconds']);

        $started = $service->start($user, 1, 'feature:mission-001');
        $this->assertFalse($started['replayed']);
        $this->assertSame('active', $started['run']['status']);
        $this->assertSame(23, $started['run']['duration_seconds']);
        $this->assertArrayNotHasKey('seed', $started['run']);
        $this->assertDatabaseHas('player_mission_runs', [
            'run_key' => 'feature:mission-001', 'catalog_version' => 1,
        ]);
        $this->assertIsArray(PlayerMissionRun::where('run_key', 'feature:mission-001')->firstOrFail()->catalog_snapshot);
        $this->assertTrue($service->start($user, 1, 'feature:mission-001')['replayed']);

        try {
            $service->start($user, 1, 'feature:mission-002');
            $this->fail('A second mission must not start while one is active.');
        } catch (\DomainException $exception) {
            $this->assertStringContainsString('active mission', $exception->getMessage());
        }
    }

    public function test_mission_claim_waits_for_server_duration_then_settles_once_and_unlocks_next_sector(): void
    {
        $user = $this->player();
        $service = app(PlayerMissionService::class);
        $started = $service->start($user, 1, 'feature:mission-003');
        $seed = $this->seedForOutcome(true);
        PlayerMissionRun::where('run_key', 'feature:mission-003')->update(['seed' => $seed]);

        try {
            $service->claim($user, 'feature:mission-003');
            $this->fail('Mission results cannot be claimed early.');
        } catch (\DomainException $exception) {
            $this->assertSame('Mission is still underway.', $exception->getMessage());
        }

        Carbon::setTestNow($started['run']['completes_at']);
        try {
            $result = $service->claim($user, 'feature:mission-003');
            $replay = $service->claim($user, 'feature:mission-003');
        } finally {
            Carbon::setTestNow();
        }

        $this->assertTrue($result['success']);
        $this->assertSame(2, $result['unlocked_sector']);
        $this->assertSame(120 + $result['rewards']['credits'], $result['wallet']['credits']);
        $this->assertTrue($replay['replayed']);
        $this->assertSame($result['wallet'], $replay['wallet']);
        $this->assertSame(4, $user->wallet()->firstOrFail()->ledgerEntries()->count());
    }

    public function test_failed_seeded_mission_pays_nothing_and_does_not_advance_progress(): void
    {
        $user = $this->player();
        $service = app(PlayerMissionService::class);
        $started = $service->start($user, 1, 'feature:mission-004');
        PlayerMissionRun::where('run_key', 'feature:mission-004')->update(['seed' => $this->seedForOutcome(false)]);
        Carbon::setTestNow($started['run']['completes_at']);
        try {
            $result = $service->claim($user, 'feature:mission-004');
        } finally {
            Carbon::setTestNow();
        }

        $this->assertFalse($result['success']);
        $this->assertSame(['credits' => 0, 'scrap' => 0], $result['rewards']);
        $this->assertSame(1, $result['unlocked_sector']);
        $this->assertSame(120, $result['wallet']['credits']);
        $this->assertSame(18, $result['wallet']['scrap']);
    }

    public function test_mission_api_ignores_client_seed_and_enforces_timed_claim(): void
    {
        $this->getJson('/api.php?action=missions')->assertUnauthorized();
        $user = $this->player();
        $this->actingAs($user)->getJson('/api.php?action=missions')
            ->assertOk()->assertJsonPath('unlocked_sector', 1)->assertJsonPath('contracts.0.duration_seconds', 23);
        $this->postJson('/api.php?action=mission_start', [
            'sector' => 1, 'run_key' => 'api:mission-005', 'seed' => 1,
        ])->assertOk()->assertJsonPath('run.status', 'active')->assertJsonMissingPath('run.seed');
        $this->postJson('/api.php?action=mission_claim', ['run_key' => 'api:mission-005'])
            ->assertStatus(409)->assertJsonPath('error', 'Mission is still underway.');
        $this->postJson('/api.php?action=mission_start', [
            'sector' => 2, 'run_key' => 'api:mission-006',
        ])->assertStatus(409);
    }
}
