<?php

namespace Tests\Feature;

use App\Models\CurrencyLedgerEntry;
use App\Models\PlayerBattle;
use App\Models\PlayerRobot;
use App\Models\User;
use App\Services\BattleResolver;
use App\Services\CurrencyLedger;
use App\Services\PlayerBattleService;
use App\Services\PlayerJobService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayerBattleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    private function player(string $username): User
    {
        $user = User::create(['username' => $username, 'password' => 'safe-example-password']);
        $user->assignRole('player');
        app(PlayerJobService::class)->ensurePlayer($user);
        app(CurrencyLedger::class)->walletFor($user);

        return $user;
    }

    public function test_defense_snapshots_are_public_read_only_and_challenge_rewards_are_idempotent(): void
    {
        $attacker = $this->player('ArenaAttacker');
        $defender = $this->player('ArenaDefender');
        $this->actingAs($defender)->postJson('/api.php?action=battle_publish_defense', ['unit_index' => 0])->assertOk();
        auth()->logout();
        $this->getJson('/api.php?action=battle_defenses')->assertOk()
            ->assertJsonPath('defenses.0.username', 'ArenaDefender')
            ->assertJsonPath('defenses.0.robot.kind', 'scavenger');

        $response = $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $defender->id, 'unit_index' => 0, 'run_key' => 'arena-match-0001',
        ])->assertCreated()->assertJsonPath('battle.result.rounds', fn ($rounds) => $rounds <= 10);
        $battle = $response->json('battle');
        $this->assertLessThanOrEqual(22, count($battle['result']['events']));
        $this->assertSame(1, $battle['result']['seed'] > 0 ? 1 : 0);

        $winnerId = $battle['result']['winner_id'];
        $before = app(CurrencyLedger::class)->walletFor(User::findOrFail($winnerId))->credits;
        $retry = $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $defender->id, 'unit_index' => 0, 'run_key' => 'arena-match-0001',
        ])->assertOk()->assertJsonPath('replayed', true);
        $this->assertSame($battle['id'], $retry->json('battle.id'));
        $this->assertSame($battle['result'], $retry->json('battle.result'));
        $after = app(CurrencyLedger::class)->walletFor(User::findOrFail($winnerId))->credits;
        $this->assertSame($before, $after);
        $this->assertDatabaseCount('player_battles', 1);
        $progression = $this->actingAs($attacker)->getJson('/api.php?action=battle_progression')->assertOk()->json('progression');
        $this->assertSame('frontier-01', $progression['season']);
        $this->assertSame($winnerId === $attacker->id ? 25 : 5, $progression['rating']);
        $this->assertSame($winnerId === $attacker->id ? 1 : 0, $progression['wins']);
        $this->assertDatabaseCount('currency_ledger_entries', 5);
        $this->actingAs($attacker)->getJson('/api.php?action=battle_history')->assertOk()->assertJsonPath('battles.0.id', $battle['id']);
        $this->actingAs($defender)->getJson('/api.php?action=battle_history')->assertOk()->assertJsonPath('battles.0.id', $battle['id']);
        $outsider = $this->player('ArenaOutsider');
        $this->actingAs($outsider)->getJson('/api.php?action=battle_history')->assertOk()->assertJsonCount(0, 'battles');
        $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $defender->id, 'unit_index' => 0, 'run_key' => 'arena-rematch-0001',
        ])->assertStatus(409)->assertJsonPath('error', 'These pilots can only battle once every 24 hours.');
        $this->actingAs($defender)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $attacker->id, 'unit_index' => 0, 'run_key' => 'arena-reverse-001',
        ])->assertStatus(409);
    }

    public function test_configured_tier_curve_grows_without_a_fixed_tier_cap(): void
    {
        $progression = app(\App\Services\CompetitiveProgression::class);
        $rules = $progression->config();
        $this->assertSame(['tier' => 1, 'next_rating' => 100], $progression->tier(0, $rules));
        $highTier = $progression->tier(100000, $rules);
        $this->assertGreaterThan(20, $highTier['tier']);
        $this->assertGreaterThan(100000, $highTier['next_rating']);
    }

    public function test_self_challenges_and_reusing_a_key_with_different_inputs_are_rejected(): void
    {
        $attacker = $this->player('ArenaPilot');
        $other = $this->player('ArenaOther');
        $service = app(PlayerBattleService::class);
        $service->publishDefense($attacker, 0);
        $service->publishDefense($other, 0);
        $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $attacker->id, 'unit_index' => 0, 'run_key' => 'arena-self-0001',
        ])->assertStatus(409);
        $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $other->id, 'unit_index' => 0, 'run_key' => 'arena-same-0001',
        ])->assertCreated();
        $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $attacker->id, 'unit_index' => 0, 'run_key' => 'arena-same-0001',
        ])->assertStatus(409);
    }

    public function test_snapshot_stays_immutable_after_defender_program_changes(): void
    {
        $attacker = $this->player('SnapshotAttacker');
        $defender = $this->player('SnapshotDefender');
        app(PlayerBattleService::class)->publishDefense($defender, 0);
        $snapshot = $this->getJson('/api.php?action=battle_defenses')->json('defenses.0.robot.program');
        PlayerRobot::query()->where('user_id', $defender->id)->where('unit_index', 0)
            ->update(['program' => json_encode([['action' => 'wait', 'seconds' => 3]])]);
        $battle = $this->actingAs($attacker)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $defender->id, 'unit_index' => 0, 'run_key' => 'arena-snap-0001',
        ])->assertCreated()->json('battle');
        $this->assertSame($snapshot, $battle['defender']['program']);
    }

    public function test_challenge_endpoint_enforces_hourly_limit_across_distinct_opponents(): void
    {
        $challenger = $this->player('RateLimitedPilot');
        $targets = [];
        for ($index = 0; $index < 6; $index++) {
            $target = $this->player('RateTarget'.$index);
            app(PlayerBattleService::class)->publishDefense($target, 0);
            $targets[] = $target;
        }

        foreach (array_slice($targets, 0, 5) as $index => $target) {
            $this->actingAs($challenger)->postJson('/api.php?action=battle_challenge', [
                'defender_id' => $target->id,
                'unit_index' => 0,
                'run_key' => 'arena-limit-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT),
            ])->assertCreated();
        }

        $this->actingAs($challenger)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $targets[5]->id,
            'unit_index' => 0,
            'run_key' => 'arena-limit-last',
        ])->assertStatus(429)->assertJsonPath('error', 'Community action limit reached. Try again later.');
        $this->assertDatabaseCount('player_battles', 5);
    }

    public function test_fixed_seed_replay_is_deterministic_and_rewards_have_one_auditable_ledger_entry(): void
    {
        $challenger = $this->player('DeterministicPilot');
        $defender = $this->player('DeterministicGuard');
        app(PlayerBattleService::class)->publishDefense($defender, 0);
        $first = $this->actingAs($challenger)->postJson('/api.php?action=battle_challenge', [
            'defender_id' => $defender->id, 'unit_index' => 0, 'run_key' => 'arena-audit-0001',
        ])->assertCreated()->json('battle');

        $resolver = app(BattleResolver::class);
        $receipt = PlayerBattle::findOrFail($first['id']);
        $replayed = $resolver->resolve($receipt->seed, $receipt->attacker_snapshot, $receipt->defender_snapshot);
        $this->assertSame($first['result'], $replayed);
        $this->assertDatabaseHas('currency_ledger_entries', [
            'idempotency_key' => 'battle:'.$first['id'].':winner',
            'reason' => 'battle_reward',
            'amount' => 25,
            'metadata->battle_id' => $first['id'],
        ]);
        $this->assertSame(1, CurrencyLedgerEntry::query()
            ->where('reason', 'battle_reward')->where('idempotency_key', 'battle:'.$first['id'].':winner')->count());
    }
}
