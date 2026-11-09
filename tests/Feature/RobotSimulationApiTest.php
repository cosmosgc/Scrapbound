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
        $this->assertNotEmpty(array_intersect(['credits', 'scrap'], array_unique(array_column($first['payouts'], 'resource'))));
    }

    public function test_multiple_server_robots_avoid_waypoint_collisions_deterministically(): void
    {
        $crew = ['scavenger' => 20, 'scrap_hound' => 0, 'fabricator' => 0];
        $program = [['action' => 'move_to', 'x' => 6, 'z' => 0], ['action' => 'return_home']];
        $resolver = app(RobotSimulationResolver::class);
        $first = $resolver->resolve($crew, ['crew' => $program], 1234, 1200);
        $replay = $resolver->resolve($crew, ['crew' => $program], 1234, 1200);

        $this->assertSame($first, $replay);
        $this->assertSame([], $first['payouts']);
        $this->assertCount(20, $first['robots']);
        for ($left = 0; $left < count($first['robots']); $left++) {
            $this->assertLessThanOrEqual(16, abs($first['robots'][$left]['x']));
            $this->assertLessThanOrEqual(10, abs($first['robots'][$left]['z']));
            foreach ([
                [-4.7, 1.7, .78], [4.35, 1.6, .78], [-4.4, -2.6, .78],
                [-3.8, -1.8, .45], [3.8, -1.8, .45],
            ] as [$obstacleX, $obstacleZ, $radius]) {
                $this->assertGreaterThanOrEqual($radius - .000001, hypot(
                    $first['robots'][$left]['x'] - $obstacleX,
                    $first['robots'][$left]['z'] - $obstacleZ,
                ));
            }
            for ($right = $left + 1; $right < count($first['robots']); $right++) {
                $distance = hypot(
                    $first['robots'][$left]['x'] - $first['robots'][$right]['x'],
                    $first['robots'][$left]['z'] - $first['robots'][$right]['z'],
                );
                $this->assertGreaterThanOrEqual(.649, $distance);
            }
        }
    }

    public function test_server_robot_routes_around_static_scene_obstacles_to_reach_a_valid_waypoint(): void
    {
        $result = app(RobotSimulationResolver::class)->resolve(
            ['scavenger' => 1, 'scrap_hound' => 0, 'fabricator' => 0],
            ['crew' => [['action' => 'move_to', 'x' => -9, 'z' => 2]], 'units' => []],
            1234,
            1200,
        );

        $this->assertCount(1, $result['robots']);
        $this->assertEqualsWithDelta(-9, $result['robots'][0]['x'], .01);
        $this->assertEqualsWithDelta(2, $result['robots'][0]['z'], .01);
        $this->assertSame('idle', $result['robots'][0]['phase']);
    }

    public function test_server_skips_an_impossible_obstacle_blocked_waypoint_without_creating_cargo(): void
    {
        $result = app(RobotSimulationResolver::class)->resolve(
            ['scavenger' => 1, 'scrap_hound' => 0, 'fabricator' => 0],
            ['crew' => [
                ['action' => 'move_to', 'x' => -4.7, 'z' => 1.7],
                ['action' => 'wait', 'seconds' => 30],
            ], 'units' => []],
            1234,
            250,
        );

        $this->assertSame([], $result['payouts']);
        $this->assertSame(0, $result['robots'][0]['cargo']);
        $this->assertSame('wait', $result['robots'][0]['phase']);
        $this->assertSame('Waiting', $result['robots'][0]['status']);
    }

    public function test_server_seed_places_varied_valid_sites_away_from_the_central_depot(): void
    {
        $resolver = app(RobotSimulationResolver::class);
        $crew = ['scavenger' => 0, 'scrap_hound' => 0, 'fabricator' => 0];
        $first = $resolver->resolve($crew, [], 1234, 0)['nodes'];
        $replay = $resolver->resolve($crew, [], 1234, 0)['nodes'];
        $other = $resolver->resolve($crew, [], 1235, 0)['nodes'];

        $this->assertCount(136, $first);
        $this->assertSame($first, $replay);
        $this->assertNotSame(array_column($first, 'x'), array_column($other, 'x'));
        $occupied = [];
        foreach ($first as $site) {
            $this->assertLessThanOrEqual(16, abs($site['x']));
            $this->assertLessThanOrEqual(10, abs($site['z']));
            $this->assertSame((int) $site['x'], $site['x']);
            $this->assertSame((int) $site['z'], $site['z']);
            $this->assertTrue(abs($site['x']) > 5 || abs($site['z']) > 3);
            // The field is rectangular and unobstructed; every straight depot route
            // remains inside the same navigation bounds.
            for ($step = 0; $step <= 10; $step++) {
                $fraction = $step / 10;
                $this->assertLessThanOrEqual(16, abs($site['x'] * $fraction));
                $this->assertLessThanOrEqual(10, abs($site['z'] * $fraction));
            }
            $occupied[] = $site['x'].':'.$site['z'];
        }
        $this->assertCount(count(array_unique($occupied)), $occupied);
    }

    public function test_automatic_server_miners_route_around_solid_blocks_and_haulers_deliver_drops(): void
    {
        $result = app(RobotSimulationResolver::class)->resolve([
            'scavenger' => 0, 'scrap_hound' => 0, 'fabricator' => 0, 'sky_miner' => 0,
            'block_miner' => 1, 'cargo_hauler' => 1, 'buffer_bot' => 0,
        ], [], 1234, 1800);

        $this->assertNotEmpty($result['payouts']);
        $this->assertNotEmpty(array_filter($result['payouts'], fn (array $payout) => $payout['amount'] > 0));
        $this->assertCount(136, $result['nodes']);
        $this->assertArrayHasKey('respawnRemaining', $result['nodes'][0]);
        $this->assertSame($result, app(RobotSimulationResolver::class)->resolve([
            'scavenger' => 0, 'scrap_hound' => 0, 'fabricator' => 0, 'sky_miner' => 0,
            'block_miner' => 1, 'cargo_hauler' => 1, 'buffer_bot' => 0,
        ], [], 1234, 1800));
    }

    public function test_technology_unlocks_alloy_spawn_weight_and_delivery_value(): void
    {
        $resolver = app(RobotSimulationResolver::class);
        $resources = app(\App\Services\GameCatalog::class)->active()['resources'];
        $locked = $resolver->resolve(['scavenger' => 0, 'scrap_hound' => 0, 'fabricator' => 0], [], 1234, 0, [], null, $resources);
        $effects = [
            'unlockResources' => ['alloy'],
            'unlockZones' => ['quarry'],
            'spawnWeightMultipliers' => ['alloy' => 2],
            'deliveryValueMultipliers' => ['alloy' => 1.5],
            'stockMultipliers' => ['alloy' => 1.5],
            'respawnTimeMultipliers' => ['alloy' => .5],
        ];
        $unlocked = $resolver->resolve(['scavenger' => 0, 'scrap_hound' => 0, 'fabricator' => 0], [], 1234, 0, [], null, $resources, $effects);
        $this->assertNotContains('alloy', array_column($locked['nodes'], 'resource'));
        $this->assertGreaterThanOrEqual(1, count(array_filter(array_column($unlocked['nodes'], 'resource'), fn (string $resource) => $resource === 'alloy')));
        $alloySites = array_values(array_filter($unlocked['nodes'], fn (array $site) => $site['resource'] === 'alloy'));
        foreach ($alloySites as $site) {
            $this->assertContains($site['stock'], [3, 5, 6]);
        }
        $this->assertSame(array_fill(0, count($alloySites), 30.0), array_column($alloySites, 'respawnSeconds'));

        $program = [['action' => 'patrol'], ['action' => 'scan'], ['action' => 'collect', 'resource' => 'alloy']];
        $run = $resolver->resolve(['scavenger' => 1, 'scrap_hound' => 0, 'fabricator' => 0], ['crew' => $program], 1234, 1200, [], null, $resources, $effects);
        $this->assertNotEmpty($run['payouts']);
        foreach ($run['payouts'] as $payout) {
            $this->assertSame('alloy', $payout['cargo_resource']);
            $this->assertSame('credits', $payout['resource']);
            $this->assertSame($payout['cargo'] * 27, $payout['amount']);
        }
    }

    public function test_program_validator_rejects_unsafe_instructions_and_unowned_unit_assignments(): void
    {
        $validator = app(RobotProgramValidator::class);
        $this->assertCount(3, $validator->validateProgram($this->creditProgram()));
        $this->assertCount(1, $validator->validateProgram([['action' => 'move_to', 'x' => 15, 'z' => -8]]));

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
        $this->assertSame(5, $first->json('core_version'));
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
