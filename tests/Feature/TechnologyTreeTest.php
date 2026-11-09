<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\GameCatalogVersion;
use App\Services\GameCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TechnologyTreeTest extends TestCase
{
    use RefreshDatabase;

    public function test_technology_purchase_checks_prerequisites_and_is_idempotent(): void
    {
        $user = User::create(['username' => 'TechPilot', 'password' => 'safe-example-password']);
        $this->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'refinery', 'request_key' => 'tech-refinery-first-001',
        ])->assertUnauthorized();

        $this->actingAs($user)->getJson('/api.php?action=technology')->assertOk()
            ->assertJsonPath('owned_node_ids', [])
            ->assertJsonPath('nodes.0.id', 'prospecting')
            ->assertJsonPath('nodes.0.available', true)
            ->assertJsonPath('nodes.1.prerequisites.0', 'prospecting')
            ->assertJsonPath('nodes.2.prerequisites.0', 'prospecting')
            ->assertJsonPath('nodes.3.prerequisites.0', 'prospecting')
            ->assertJsonPath('resources.2.id', 'alloy');

        $this->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'refinery', 'request_key' => 'tech-refinery-first-001',
        ])->assertStatus(409);

        $payload = ['node_id' => 'prospecting', 'request_key' => 'tech-prospecting-001'];
        $first = $this->postJson('/api.php?action=technology_purchase', $payload)
            ->assertOk()->assertJsonPath('replayed', false)
            ->assertJsonPath('wallet.credits', 30)
            ->assertJsonPath('technology.effects.unlockResources.0', 'alloy')
            ->assertJsonPath('technology.effects.unlockZones.0', 'quarry')
            ->assertJsonPath('technology.effects.spawnWeightMultipliers.alloy', 2);

        $this->postJson('/api.php?action=technology_purchase', $payload)
            ->assertOk()->assertJsonPath('replayed', true)->assertJsonPath('wallet.credits', 30);
        $this->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'refinery', 'request_key' => 'tech-prospecting-001',
        ])->assertStatus(409);

        $this->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'refinery', 'request_key' => 'tech-refinery-buy-001',
        ])->assertOk()->assertJsonPath('wallet.scrap', 6)
            ->assertJsonPath('technology.effects.deliveryValueMultipliers.alloy', 1.5)
            ->assertJsonPath('technology.effects.stockMultipliers.alloy', 1.5)
            ->assertJsonPath('technology.effects.respawnTimeMultipliers.alloy', .5)
            ->assertJsonPath('technology.effects.sceneUnlocks.0', 'survey_beacon');

        $this->assertDatabaseCount('player_technology_unlocks', 2);
        $this->assertDatabaseCount('player_technology_purchase_receipts', 2);
        $this->assertDatabaseHas('currency_ledger_entries', ['user_id' => $user->id, 'reason' => 'technology_purchase']);
    }

    public function test_purchased_nodes_preserve_future_capability_unlock_effects(): void
    {
        $user = User::create(['username' => 'FutureTechPilot', 'password' => 'safe-example-password']);
        $content = app(GameCatalog::class)->validate(config('scrapbound'));
        $content['technologyNodes'][0]['effects']['unlockCapabilities'] = ['remote_drone_ops'];
        $content['technologyNodes'][0]['effects']['unlockPrograms'] = ['salvage_route_v2'];
        $content['technologyNodes'][0]['effects']['unlockModules'] = ['deep_scanner'];
        $content['technologyNodes'][0]['effects']['unlockBotKinds'] = ['survey_rover'];
        GameCatalogVersion::create([
            'version' => 99, 'status' => 'published', 'content' => $content, 'published_at' => now(),
        ]);

        $this->actingAs($user)->postJson('/api.php?action=technology_purchase', [
            'node_id' => 'prospecting', 'request_key' => 'future-tech-unlocks-001',
        ])->assertOk()
            ->assertJsonPath('technology.effects.unlockCapabilities.0', 'remote_drone_ops')
            ->assertJsonPath('technology.effects.unlockPrograms.0', 'salvage_route_v2')
            ->assertJsonPath('technology.effects.unlockModules.0', 'deep_scanner')
            ->assertJsonPath('technology.effects.unlockBotKinds.0', 'survey_rover');
    }
}
