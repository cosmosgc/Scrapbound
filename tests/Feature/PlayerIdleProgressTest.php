<?php

namespace Tests\Feature;

use App\Models\PlayerIdleState;
use App\Models\PlayerTechnologyUnlock;
use App\Models\User;
use App\Services\CurrencyLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PlayerIdleProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_offline_settlement_is_server_timed_bounded_delivery_only_and_idempotent(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-01 12:00:00'));
        config([
            'idle_progress.max_offline_seconds' => 3600,
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
            ->assertJsonPath('offline_cap_seconds', 120)
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

    public function test_owned_technology_extends_offline_cap_but_client_values_do_not(): void
    {
        config(['idle_progress.max_offline_seconds' => 14400, 'idle_progress.max_ticks' => 288000]);
        $user = User::create(['username' => 'RemoteOpsPilot', 'password' => 'safe-example-password']);
        PlayerIdleState::create([
            'user_id' => $user->id, 'world_seed' => 4321, 'last_settled_at' => now()->subHours(6),
        ]);
        app(CurrencyLedger::class)->grant($user, 'credits', 200, 'offline-tech-grant-001', 'test_adjustment');
        $this->actingAs($user)->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'prospecting', 'request_key' => 'idle-tech-prospect-001',
        ])->assertOk();
        $this->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'refinery', 'request_key' => 'idle-tech-refinery-001',
        ])->assertOk();
        $this->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'remote_operations', 'request_key' => 'idle-tech-remote-001',
        ])->assertOk()->assertJsonPath('technology.effects.offlineSecondsBonus', 3600);

        $this->actingAs($user)->postJson('/api.php?action=idle_settle', [
            'request_key' => 'offline-tech-cap-001', 'elapsed_seconds' => 1, 'world_seed' => 7,
        ])->assertOk()
            ->assertJsonPath('elapsed_seconds', 21600)
            ->assertJsonPath('offline_cap_seconds', 18000)
            ->assertJsonPath('credited_seconds', 18000)
            ->assertJsonPath('ticks', 180000)
            ->assertJsonPath('capped', true)
            ->assertJsonPath('world_seed', 4321);
    }

    public function test_offline_technology_cannot_exceed_eight_hour_ceiling_or_tick_budget(): void
    {
        config(['idle_progress.max_offline_seconds' => 14400, 'idle_progress.max_ticks' => 288000]);
        $user = User::create(['username' => 'HardCapPilot', 'password' => 'safe-example-password']);
        PlayerIdleState::create([
            'user_id' => $user->id, 'world_seed' => 8765, 'last_settled_at' => now()->subHours(10),
        ]);
        foreach ([1, 2] as $index) {
            PlayerTechnologyUnlock::create([
                'user_id' => $user->id, 'node_id' => "offline_extension_{$index}", 'catalog_version' => 1,
                'effects' => ['offlineSecondsBonus' => 14400], 'purchased_at' => now(),
            ]);
        }

        $this->actingAs($user)->postJson('/api.php?action=idle_settle', ['request_key' => 'offline-hard-cap-001'])
            ->assertOk()
            ->assertJsonPath('offline_cap_seconds', 28800)
            ->assertJsonPath('credited_seconds', 28800)
            ->assertJsonPath('ticks', 288000)
            ->assertJsonPath('capped', true);
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
