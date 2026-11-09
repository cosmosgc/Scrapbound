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
            ->assertJsonPath('catalog.rewards.creditsPerCargo', 5)
            ->assertJsonPath('catalog.featureFlags.tradesEnabled', false);
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
        $this->assertSame(5, $validated['resources'][0]['respawnSeconds']);

        $catalog['technologyNodes'][0]['effects']['respawnTimeMultipliers'] = ['alloy' => 0];
        $this->expectException(DomainException::class);
        app(GameCatalog::class)->validate($catalog);
    }
}
