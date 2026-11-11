<?php

namespace Tests\Feature;

use App\Models\GameCatalogVersion;
use App\Services\GameCatalog;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_api_returns_validated_versioned_content_without_authentication(): void
    {
        $this->getJson('/api.php?action=catalog')
            ->assertOk()
            ->assertJsonPath('catalog.version', 1)
            ->assertJsonPath('catalog.items.0.id', 'scavenger')
            ->assertJsonPath('catalog.items.0.priceGrowth', 1.17)
            ->assertJsonPath('catalog.items.3.id', 'sky_miner')
            ->assertJsonPath('catalog.technologyNodes.4.effects.unlockBotKinds.0', 'block_miner')
            ->assertJsonPath('catalog.rewards.creditsPerCargo', 5)
            ->assertJsonPath('catalog.featureFlags.tradesEnabled', false);
    }

    public function test_honeycomb_grid_positions_are_bounded_and_unique(): void
    {
        $content = config('scrapbound');
        $content['technologyNodes'][0]['gridPosition'] = ['q' => 0, 'r' => 0];
        $content['technologyNodes'][1]['gridPosition'] = ['q' => 1, 'r' => 0];
        $validated = app(GameCatalog::class)->validate($content);
        $this->assertSame(['q' => 0, 'r' => 0], $validated['technologyNodes'][0]['gridPosition']);

        $content['technologyNodes'][1]['gridPosition'] = ['q' => 0, 'r' => 0];
        try {
            app(GameCatalog::class)->validate($content);
            $this->fail('Expected duplicate honeycomb positions to be rejected.');
        } catch (DomainException $exception) {
            $this->assertStringContainsString('cannot share', $exception->getMessage());
        }
    }

    public function test_active_database_catalog_supersedes_the_fallback_version(): void
    {
        $content = app(GameCatalog::class)->validate(config('scrapbound'));
        $content['items'][0]['cost'] = 77;
        GameCatalogVersion::create(['version' => 2, 'status' => 'published', 'content' => $content, 'published_at' => now()]);

        $this->getJson('/api.php?action=catalog')
            ->assertOk()
            ->assertJsonPath('catalog.version', 2)
            ->assertJsonPath('catalog.items.0.cost', 77);
    }

    public function test_catalog_validation_rejects_duplicate_items_and_unsafe_display_values(): void
    {
        $content = config('scrapbound');
        $content['items'][] = $content['items'][0];
        $this->expectException(DomainException::class);
        app(GameCatalog::class)->validate($content);
    }

    public function test_technology_catalog_rejects_prerequisite_cycles_and_unbounded_effects(): void
    {
        $content = config('scrapbound');
        $content['technologyNodes'][0]['prerequisites'] = ['refinery'];
        $this->expectException(DomainException::class);
        app(GameCatalog::class)->validate($content);
    }

    public function test_catalog_normalizes_older_resource_definitions_and_bounds_respawn_effects(): void
    {
        $catalog = config('scrapbound');
        unset($catalog['resources'][0]['respawnSeconds']);
        $validated = app(GameCatalog::class)->validate($catalog);
        $this->assertSame(60, $validated['resources'][0]['respawnSeconds']);

        $catalog = config('scrapbound');
        $catalog['resources'][0]['respawnSeconds'] = 5;
        $this->assertSame(60, app(GameCatalog::class)->validate($catalog)['resources'][0]['respawnSeconds']);

        $catalog['technologyNodes'][0]['effects']['respawnTimeMultipliers'] = ['alloy' => 0];
        $this->expectException(DomainException::class);
        app(GameCatalog::class)->validate($catalog);
    }

    public function test_offline_time_technology_effect_is_an_integer_bounded_to_four_hours(): void
    {
        $content = config('scrapbound');
        $content['technologyNodes'][0]['effects']['offlineSecondsBonus'] = 14400;
        $validated = app(GameCatalog::class)->validate($content);
        $this->assertSame(14400, $validated['technologyNodes'][0]['effects']['offlineSecondsBonus']);

        $content['technologyNodes'][0]['effects']['offlineSecondsBonus'] = 14401;
        $this->expectException(DomainException::class);
        app(GameCatalog::class)->validate($content);
    }
}
