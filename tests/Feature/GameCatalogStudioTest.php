<?php

namespace Tests\Feature;

use App\Models\GameCatalogAudit;
use App\Models\GameCatalogVersion;
use App\Models\User;
use App\Services\GameCatalog;
use App\Services\GameCatalogStudio;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameCatalogStudioTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function user(string $name, string $role): User
    {
        $user = User::create(['username' => $name, 'password' => 'safe-example-password']);
        $user->assignRole($role);

        return $user;
    }

    public function test_only_admins_can_open_catalog_studio_or_preview_and_save_versions(): void
    {
        $player = $this->user('CatalogPlayer', 'player');
        $moderator = $this->user('CatalogMod', 'moderator');
        $admin = $this->user('CatalogAdmin', 'admin');
        $content = app(GameCatalog::class)->validate(config('scrapbound'));

        $this->getJson('/api.php?action=catalog_studio')->assertUnauthorized();
        $this->actingAs($player)->getJson('/api.php?action=catalog_studio')->assertForbidden();
        $this->actingAs($moderator)->postJson('/api.php?action=catalog_preview', ['content' => $content])->assertForbidden();
        $this->actingAs($admin)->postJson('/api.php?action=catalog_preview', ['content' => $content])
            ->assertOk()->assertJsonPath('preview.items.0.id', 'scavenger');
        $this->actingAs($admin)->postJson('/api.php?action=catalog_preview', ['content' => ['items' => []]])
            ->assertStatus(422);
        $this->actingAs($admin)->postJson('/api.php?action=catalog_draft', ['content' => $content])
            ->assertCreated()->assertJsonPath('status', 'draft');
    }

    public function test_catalog_versions_are_immutable_publishable_disableable_and_rollback_creates_a_new_version(): void
    {
        $admin = $this->user('CatalogVersionAdmin', 'admin');
        $studio = app(GameCatalogStudio::class);
        $content = app(GameCatalog::class)->validate(config('scrapbound'));
        $content['items'][0]['cost'] = 77;
        $firstDraft = $studio->createDraft($admin, $content);
        $this->assertSame(55, app(GameCatalog::class)->active()['items'][0]['cost']);
        $first = $studio->publish($admin, $firstDraft->id);
        $this->assertSame(77, app(GameCatalog::class)->active()['items'][0]['cost']);

        $secondContent = $content;
        $secondContent['items'][0]['cost'] = 88;
        $secondDraft = $studio->createDraft($admin, $secondContent);
        $second = $studio->publish($admin, $secondDraft->id);
        $this->assertSame(88, app(GameCatalog::class)->active()['items'][0]['cost']);
        $rollback = $studio->rollback($admin, $first->id);
        $this->assertSame(3, $rollback->version);
        $this->assertSame($first->id, $rollback->rollback_of);
        $this->assertSame(77, app(GameCatalog::class)->active()['items'][0]['cost']);
        $this->assertSame('retired', $second->fresh()->status);
        $this->assertSame('retired', $studio->disable($admin, $rollback->id)->status);
        $this->assertSame(55, app(GameCatalog::class)->active()['items'][0]['cost']);
        $this->assertSame(6, GameCatalogAudit::count());
        $this->assertSame(77, GameCatalogVersion::findOrFail($first->id)->content['items'][0]['cost']);
    }

    public function test_catalog_studio_can_preview_and_draft_resource_zone_and_technology_effect_edits(): void
    {
        $admin = $this->user('CatalogTechEditor', 'admin');
        $content = app(GameCatalog::class)->validate(config('scrapbound'));
        $content['resources'][2]['maxStock'] = 9;
        $content['resources'][2]['zone'] = 'deep_quarry';
        $content['technologyNodes'][0]['effects']['unlockZones'] = ['deep_quarry'];
        $content['technologyNodes'][1]['effects']['stockMultipliers']['alloy'] = 2;
        $content['technologyNodes'][1]['effects']['respawnTimeMultipliers']['alloy'] = .75;
        $content['technologyNodes'][0]['effects']['unlockCapabilities'] = ['remote_drone_ops'];

        $this->actingAs($admin)->postJson('/api.php?action=catalog_preview', ['content' => $content])
            ->assertOk()
            ->assertJsonPath('preview.resources.2.maxStock', 9)
            ->assertJsonPath('preview.resources.2.zone', 'deep_quarry')
            ->assertJsonPath('preview.technologyNodes.0.effects.unlockZones.0', 'deep_quarry')
            ->assertJsonPath('preview.technologyNodes.1.effects.stockMultipliers.alloy', 2)
            ->assertJsonPath('preview.technologyNodes.1.effects.respawnTimeMultipliers.alloy', .75)
            ->assertJsonPath('preview.technologyNodes.0.effects.unlockCapabilities.0', 'remote_drone_ops');
        $draft = $this->postJson('/api.php?action=catalog_draft', ['content' => $content])
            ->assertCreated()->assertJsonPath('status', 'draft');
        $this->assertSame('draft', $draft->json('status'));
        $this->assertSame(9, GameCatalogVersion::query()->findOrFail($draft->json('id'))->content['resources'][2]['maxStock']);
    }
}
