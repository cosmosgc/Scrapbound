<?php

namespace Tests\Feature;

use App\Models\PlayerIdleState;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayerIdleProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_offline_settlement_is_server_timed_bounded_delivery_only_and_idempotent(): void
    {
        config([
            'idle_progress.max_offline_seconds' => 120,
            'idle_progress.max_ticks' => 1200,
        ]);
        $user = User::create(['username' => 'IdlePilot', 'password' => 'safe-example-password']);
        PlayerIdleState::create([
            'user_id' => $user->id,
            'world_seed' => 1234,
            'last_settled_at' => now()->subHour(),
        ]);
        $payload = [
            'request_key' => 'offline-settle-001',
            'elapsed_seconds' => 999999999,
            'world_seed' => 0,
        ];

        $first = $this->actingAs($user)->postJson('/api.php?action=idle_settle', $payload)
            ->assertOk()
            ->assertJsonPath('elapsed_seconds', 3600)
            ->assertJsonPath('credited_seconds', 120)
            ->assertJsonPath('capped', true)
            ->assertJsonPath('world_seed', 1234)
            ->assertJsonPath('replayed', false);

        $this->assertNotEmpty($first->json('payouts'));
        $this->assertSame(1200, $first->json('ticks'));
        $this->assertGreaterThan(0, array_sum(array_column($first->json('payouts'), 'deliveries')));
        $walletAfterSettlement = $first->json('wallet');

        $this->postJson('/api.php?action=idle_settle', $payload)
            ->assertOk()
            ->assertJsonPath('replayed', true)
            ->assertJsonPath('wallet.credits', $walletAfterSettlement['credits'])
            ->assertJsonPath('wallet.scrap', $walletAfterSettlement['scrap']);

        $this->assertDatabaseCount('player_idle_settlement_receipts', 1);
        $this->assertDatabaseHas('currency_ledger_entries', [
            'user_id' => $user->id,
            'reason' => 'offline_robot_delivery',
        ]);
    }

    public function test_first_idle_settlement_establishes_a_server_baseline_without_retroactive_payout(): void
    {
        $user = User::create(['username' => 'NewIdlePilot', 'password' => 'safe-example-password']);

        $this->actingAs($user)->postJson('/api.php?action=idle_settle', ['request_key' => 'offline-first-001'])
            ->assertOk()
            ->assertJsonPath('elapsed_seconds', 0)
            ->assertJsonPath('credited_seconds', 0)
            ->assertJsonPath('payouts', [])
            ->assertJsonPath('replayed', false);

        $this->assertDatabaseHas('player_idle_states', ['user_id' => $user->id]);
    }

    public function test_online_server_run_advances_the_same_idle_settlement_clock(): void
    {
        $user = User::create(['username' => 'OnlineIdlePilot', 'password' => 'safe-example-password']);
        $state = PlayerIdleState::create([
            'user_id' => $user->id,
            'world_seed' => 7654,
            'last_settled_at' => now()->subHour(),
        ]);

        $this->actingAs($user)->postJson('/api.php?action=robot_simulate', [
            'run_key' => 'online-idle-run-001', 'seed' => 1, 'ticks' => 1,
        ])->assertOk()->assertJsonPath('seed', 7654);

        $this->assertTrue($state->fresh()->last_settled_at->greaterThan(now()->subSeconds(5)));
        $this->postJson('/api.php?action=idle_settle', ['request_key' => 'online-idle-after-001'])
            ->assertOk()->assertJsonPath('elapsed_seconds', 0);
    }

    public function test_idle_settlement_requires_authentication(): void
    {
        $this->postJson('/api.php?action=idle_settle', ['request_key' => 'offline-auth-001'])->assertUnauthorized();
    }
}
