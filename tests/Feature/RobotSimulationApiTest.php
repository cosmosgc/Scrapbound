<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PlayerJobService;
use App\Services\RobotProgramValidator;
use App\Services\RobotSimulationResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RobotSimulationApiTest extends TestCase
{
    use RefreshDatabase;

    private function creditProgram(): array
    {
        return [
            ['action' => 'patrol'],
            ['action' => 'scan'],
            ['action' => 'collect', 'resource' => 'credits'],
        ];
    }

    public function test_server_resolver_is_deterministic_and_only_pays_after_delivery(): void
    {
        $crew = ['scavenger' => 1, 'scrap_hound' => 0, 'fabricator' => 0];
        $assignments = ['crew' => $this->creditProgram(), 'units' => []];
        $resolver = app(RobotSimulationResolver::class);

        $short = $resolver->resolve($crew, $assignments, 42, 1);
        $first = $resolver->resolve($crew, $assignments, 42, 1200);
        $replay = $resolver->resolve($crew, $assignments, 42, 1200);

        $this->assertSame([], $short['payouts']);
        $this->assertNotEmpty($first['payouts']);
        $this->assertSame($first, $replay);
        $this->assertSame(['credits'], array_values(array_unique(array_column($first['payouts'], 'resource'))));
    }

    public function test_program_validator_rejects_unsafe_instructions_and_unowned_unit_assignments(): void
    {
        $validator = app(RobotProgramValidator::class);
        $this->assertCount(3, $validator->validateProgram($this->creditProgram()));

        try {
            $validator->validateProgram([['action' => 'eval', 'code' => 'bad']]);
            $this->fail('Unsupported instructions must be rejected.');
        } catch (\InvalidArgumentException) {
            $this->assertTrue(true);
        }

        try {
            $validator->validateAssignments(['units' => [1 => $this->creditProgram()]], 1);
            $this->fail('Assignments cannot refer to unowned robot IDs.');
        } catch (\InvalidArgumentException) {
            $this->assertTrue(true);
        }
    }

    public function test_simulation_endpoint_grants_only_server_resolved_deliveries_and_replays_once(): void
    {
        $this->postJson('/api.php?action=robot_simulate', [])->assertUnauthorized();
        $user = User::create(['username' => 'ServerSimPilot', 'password' => 'safe-example-password']);
        app(PlayerJobService::class)->assignProgram($user, 0, [
            ['action' => 'patrol'], ['action' => 'scan'], ['action' => 'collect', 'resource' => 'scrap'],
        ]);
        $payload = [
            'run_key' => 'feature-run-001',
            'seed' => 42,
            'ticks' => 1200,
            'crew' => ['scavenger' => 20, 'scrap_hound' => 0, 'fabricator' => 0], // ignored by server authority
            'assignments' => ['crew' => $this->creditProgram()],
        ];

        $first = $this->actingAs($user)->postJson('/api.php?action=robot_simulate', $payload)
            ->assertOk()->assertJsonPath('replayed', false);
        $this->assertCount(1, $first->json('snapshot.robots'));
        $this->assertNotEmpty($first->json('payouts'));
        $this->assertSame(['scrap'], array_values(array_unique(array_column($first->json('payouts'), 'resource'))));
        $expectedScrap = 18 + array_sum(array_column($first->json('payouts'), 'amount'));
        $this->assertSame($expectedScrap, $first->json('wallet.scrap'));

        $this->postJson('/api.php?action=robot_simulate', $payload)
            ->assertOk()->assertJsonPath('replayed', true)->assertJsonPath('wallet.scrap', $expectedScrap);
        $this->postJson('/api.php?action=robot_simulate', [...$payload, 'ticks' => 1201])
            ->assertStatus(409);
        $this->assertSame($expectedScrap, $user->wallet()->firstOrFail()->scrap);
        $this->assertDatabaseCount('robot_simulation_run_receipts', 1);
    }
}
