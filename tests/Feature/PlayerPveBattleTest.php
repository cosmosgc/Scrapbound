<?php

namespace Tests\Feature;

use App\Models\PlayerPveBattle;
use App\Models\User;
use App\Services\CurrencyLedger;
use App\Services\PlayerJobService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayerPveBattleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_player_can_fight_npc_with_owned_pvp_build_and_replay_reward_is_idempotent(): void
    {
        $pilot = User::create(['username' => 'PvePilot', 'password' => 'safe-example-password']);
        $pilot->assignRole('player');
        app(PlayerJobService::class)->ensurePlayer($pilot);
        $wallet = app(CurrencyLedger::class)->walletFor($pilot);
        $before = $wallet->credits;
        $this->actingAs($pilot)->getJson('/api.php?action=pve_encounters')->assertOk()
            ->assertJsonPath('encounters.0.id', 'scrapling');

        $input = ['unit_index' => 0, 'encounter_id' => 'scrapling', 'run_key' => 'pve-pilot-match-001'];
        $battle = $this->postJson('/api.php?action=pve_challenge', $input)->assertCreated()
            ->assertJsonPath('battle.mode', 'pve')->json('battle');
        $this->assertSame(1, PlayerPveBattle::query()->count());
        $this->assertSame($battle['result'], PlayerPveBattle::firstOrFail()->result);
        $this->assertDatabaseCount('season_standings', 0);
        $this->assertDatabaseHas('currency_ledger_entries', [
            'idempotency_key' => 'pve-battle:'.PlayerPveBattle::firstOrFail()->id.':winner',
            'reason' => 'pve_battle_reward',
        ]);

        $retry = $this->postJson('/api.php?action=pve_challenge', $input)->assertOk()->assertJsonPath('replayed', true);
        $this->assertSame($battle['result'], $retry->json('battle.result'));
        $this->assertSame($before + $battle['result']['rewards']['winner_credits'], app(CurrencyLedger::class)->walletFor($pilot)->credits);
        $this->actingAs($pilot)->getJson('/api.php?action=pve_history')->assertOk()->assertJsonPath('battles.0.id', $battle['id']);
    }

    public function test_pve_fights_require_authentication_and_reject_unknown_encounters(): void
    {
        $this->postJson('/api.php?action=pve_challenge', [])->assertUnauthorized();
        $pilot = User::create(['username' => 'PveInvalid', 'password' => 'safe-example-password']);
        $pilot->assignRole('player');
        app(PlayerJobService::class)->ensurePlayer($pilot);
        $this->actingAs($pilot)->postJson('/api.php?action=pve_challenge', [
            'unit_index' => 0, 'encounter_id' => 'browser-invented-boss', 'run_key' => 'pve-invalid-0001',
        ])->assertStatus(409);
        $this->assertDatabaseCount('player_pve_battles', 0);
    }
}
