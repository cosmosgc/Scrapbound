<?php

namespace Tests\Feature;

use App\Models\BrainTemplate;
use App\Models\User;
use App\Services\CurrencyLedger;
use App\Services\PlayerJobService;
use Database\Seeders\BrainTemplateSeeder;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayerJobServiceTest extends TestCase
{
    use RefreshDatabase;

    private function player(): User
    {
        $this->seed(BrainTemplateSeeder::class);

        return User::create(['username' => 'JobPilot', 'password' => 'safe-example-password']);
    }

    public function test_player_gets_a_persisted_starter_robot_and_program(): void
    {
        $user = $this->player();
        $jobs = app(PlayerJobService::class)->jobs($user);

        $this->assertCount(1, $jobs['robots']);
        $this->assertSame('scavenger', $jobs['robots'][0]['kind']);
        $this->assertSame('patrol', $jobs['robots'][0]['program'][0]['action']);
        $this->assertSame('salvage-scout', $jobs['templates'][0]['slug']);
        $this->assertTrue($jobs['templates'][0]['unlocked']);
    }

    public function test_robot_purchase_uses_catalog_price_and_is_idempotent(): void
    {
        $user = $this->player();
        $jobs = app(PlayerJobService::class)->purchaseRobot($user, 'scrap_hound', 'jobs:purchase-001');
        $replay = app(PlayerJobService::class)->purchaseRobot($user, 'scrap_hound', 'jobs:purchase-001');

        $this->assertCount(2, $jobs['robots']);
        $this->assertSame('scrap_hound', $jobs['robots'][1]['kind']);
        $this->assertCount(2, $replay['robots']);
        $this->assertSame(85, $replay['wallet']['credits']);

        $this->expectException(DomainException::class);
        app(PlayerJobService::class)->purchaseRobot($user, 'scavenger', 'jobs:purchase-001');
    }

    public function test_program_assignments_and_template_unlocks_are_persisted_and_compatible(): void
    {
        $user = $this->player();
        $ledger = app(CurrencyLedger::class);
        $ledger->walletFor($user);
        $ledger->grant($user, 'scrap', 20, 'jobs:scrap-grant-1', 'test_grant');
        $jobs = app(PlayerJobService::class);
        $scrapRunner = BrainTemplate::where('slug', 'scrap-runner')->firstOrFail();

        $unlocked = $jobs->unlockTemplate($user, $scrapRunner->id, 'jobs:unlock-template1');
        $this->assertSame(13, $unlocked['wallet']['scrap']);
        $deployed = $jobs->deployTemplate($user, $scrapRunner->id, 0);
        $this->assertSame('scrap', $deployed['robots'][0]['program'][2]['resource']);

        $custom = [['action' => 'move_to', 'x' => 2, 'z' => -1], ['action' => 'return_home']];
        $assigned = $jobs->assignProgram($user, 'all', $custom);
        $this->assertSame($custom, $assigned['robots'][0]['program']);
        $this->assertSame(3, $assigned['robots'][0]['program_version']);
    }

    public function test_job_api_persists_programs_and_ignores_client_owned_count(): void
    {
        $user = $this->player();
        $this->actingAs($user)->getJson('/api.php?action=jobs')->assertOk()->assertJsonCount(1, 'robots');
        $this->postJson('/api.php?action=robot_program', [
            'target' => '0', 'program' => [['action' => 'move_to', 'x' => 1, 'z' => 0]], 'owned' => ['scavenger' => 20],
        ])->assertOk()->assertJsonPath('robots.0.program.0.action', 'move_to')->assertJsonCount(1, 'robots');
        $this->postJson('/api.php?action=robot_program', [
            'target' => '0', 'program' => [['action' => 'eval']],
        ])->assertStatus(422);
    }
}
