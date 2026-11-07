<?php

namespace Tests\Feature;

use App\Models\CommunityPost;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class CommunityModerationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function user(string $username, string $role = 'player'): User
    {
        $user = User::create(['username' => $username, 'password' => 'safe-example-password']);
        $user->assignRole($role);

        return $user;
    }

    public function test_reports_are_rate_limited_reviewed_and_audited_with_hidden_posts_removed_from_public_feed(): void
    {
        $owner = $this->user('ReportOwner');
        $reporter = $this->user('ReportPilot');
        $moderator = $this->user('ReportMod', 'moderator');
        $post = CommunityPost::create([
            'user_id' => $owner->id, 'kind' => 'help', 'title' => 'Need a repair crew',
            'body' => 'Could someone help repair my scavenger bot?',
        ]);

        $report = $this->actingAs($reporter)->postJson('/api.php?action=community_report', [
            'post_id' => $post->id, 'reason' => 'spam', 'details' => 'Repeated advertising.',
        ])->assertCreated()->json('report_id');
        $this->actingAs($reporter)->getJson('/api.php?action=moderation_queue')->assertForbidden();
        $this->actingAs($moderator)->getJson('/api.php?action=moderation_queue')
            ->assertOk()->assertJsonPath('reports.0.id', $report);
        $this->actingAs($moderator)->postJson('/api.php?action=moderation_resolve', [
            'report_id' => $report, 'decision' => 'hide_post', 'note' => 'Confirmed spam.',
        ])->assertOk()->assertJsonPath('post_hidden', true);

        $this->getJson('/api.php?action=community_feed')->assertOk()->assertJsonMissing(['id' => $post->id]);
        $this->assertDatabaseHas('community_reports', ['id' => $report, 'status' => 'resolved', 'resolved_by' => $moderator->id]);
        $this->assertDatabaseHas('community_moderation_audits', [
            'moderator_id' => $moderator->id, 'action' => 'hide_post', 'target_id' => $post->id,
        ]);
    }

    public function test_blocks_hide_each_others_posts_and_prevent_direct_interactions_until_unblocked(): void
    {
        $blocker = $this->user('BlockerPilot');
        $blocked = $this->user('BlockedPilot');
        $blockedPost = CommunityPost::create([
            'user_id' => $blocked->id, 'kind' => 'help', 'title' => 'Need a repair crew',
            'body' => 'Could someone help repair my scavenger bot?',
        ]);
        $blockerPost = CommunityPost::create([
            'user_id' => $blocker->id, 'kind' => 'help', 'title' => 'Need a salvage crew',
            'body' => 'Could someone join my expedition crew?',
        ]);

        $this->actingAs($blocker)->postJson('/api.php?action=community_block', ['user_id' => $blocked->id])
            ->assertOk()->assertJsonPath('blocked', true);
        $feed = $this->actingAs($blocker)->getJson('/api.php?action=community_feed')->assertOk();
        $this->assertNotContains($blockedPost->id, array_column($feed->json('posts'), 'id'));
        $this->actingAs($blocked)->postJson('/api.php?action=community_reply', [
            'post_id' => $blockerPost->id, 'message' => 'I would like to join.',
        ])->assertForbidden();
        $this->actingAs($blocker)->postJson('/api.php?action=community_unblock', ['user_id' => $blocked->id])
            ->assertOk()->assertJsonPath('unblocked', true);
        $this->actingAs($blocker)->getJson('/api.php?action=community_feed')->assertJsonFragment(['id' => $blockedPost->id]);
    }

    public function test_community_posts_are_rate_limited_and_moderation_records_follow_retention_dates(): void
    {
        $player = $this->user('RateLimitPilot');
        for ($index = 0; $index < 5; $index++) {
            $this->actingAs($player)->postJson('/api.php?action=community_post', [
                'kind' => 'help', 'title' => "Repair request {$index}", 'body' => 'Need help repairing one bot.',
            ])->assertOk();
        }
        $this->actingAs($player)->postJson('/api.php?action=community_post', [
            'kind' => 'help', 'title' => 'One too many requests', 'body' => 'Need help repairing one bot.',
        ])->assertStatus(429)->assertJsonPath('error', 'Community action limit reached. Try again later.');

        $oldPost = CommunityPost::create([
            'user_id' => $player->id, 'kind' => 'help', 'title' => 'Reported old post', 'body' => 'This should age out.',
        ]);
        $report = $player->reports()->create([
            'post_id' => $oldPost->id, 'reason' => 'other', 'details' => '', 'status' => 'dismissed',
            'retain_until' => Carbon::now()->subSecond(),
        ]);
        $player->moderationActions()->create([
            'action' => 'dismiss', 'target_type' => 'community_post', 'target_id' => $oldPost->id,
            'reason' => '', 'metadata' => [], 'retain_until' => Carbon::now()->subSecond(), 'created_at' => now(),
        ]);

        $this->artisan('community:prune-moderation-data')->assertSuccessful();
        $this->assertDatabaseMissing('community_reports', ['id' => $report->id]);
        $this->assertDatabaseCount('community_moderation_audits', 0);
    }
}
