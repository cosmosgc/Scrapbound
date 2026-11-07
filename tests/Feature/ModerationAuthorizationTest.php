<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class ModerationAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_players_cannot_access_moderation_or_catalog_privileges(): void
    {
        $player = User::create(['username' => 'PolicyPlayer', 'password' => 'safe-example-password']);
        $player->assignRole('player');

        $this->assertFalse(Gate::forUser($player)->allows('view-moderation-queue'));
        $this->assertFalse(Gate::forUser($player)->allows('resolve-moderation-reports'));
        $this->assertFalse(Gate::forUser($player)->allows('manage-community-settings'));
        $this->assertFalse(Gate::forUser($player)->allows('manage-game-catalog'));
    }

    public function test_moderators_can_review_reports_but_only_admins_can_change_policy_or_catalog(): void
    {
        $moderator = User::create(['username' => 'PolicyMod', 'password' => 'safe-example-password']);
        $moderator->assignRole('moderator');
        $admin = User::create(['username' => 'PolicyAdmin', 'password' => 'safe-example-password']);
        $admin->assignRole('admin');

        $this->assertTrue(Gate::forUser($moderator)->allows('view-moderation-queue'));
        $this->assertTrue(Gate::forUser($moderator)->allows('resolve-moderation-reports'));
        $this->assertFalse(Gate::forUser($moderator)->allows('manage-community-settings'));
        $this->assertFalse(Gate::forUser($moderator)->allows('manage-game-catalog'));

        $this->assertTrue(Gate::forUser($admin)->allows('view-moderation-queue'));
        $this->assertTrue(Gate::forUser($admin)->allows('resolve-moderation-reports'));
        $this->assertTrue(Gate::forUser($admin)->allows('manage-community-settings'));
        $this->assertTrue(Gate::forUser($admin)->allows('manage-game-catalog'));
    }
}
