<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScrapboundRoutesTest extends TestCase
{
    use RefreshDatabase;

    public function test_deep_game_routes_render_the_blade_app(): void
    {
        $this->get('/community')->assertOk()->assertSee('Community board')->assertSee('factory-scene');
    }

    public function test_status_returns_session_csrf_token(): void
    {
        $this->getJson('/api.php?action=status')
            ->assertOk()
            ->assertJsonStructure(['ok', 'player', 'csrf', 'ready']);
    }

    public function test_registration_assigns_the_player_role_and_supports_sanctum_tokens(): void
    {
        $this->postJson('/api.php?action=register', [
            'username' => 'ScrapPilot',
            'password' => 'safe-example-password',
        ])->assertOk()->assertJsonPath('player.username', 'ScrapPilot');

        $user = User::where('username', 'ScrapPilot')->firstOrFail();
        $this->assertTrue($user->hasRole('player'));
        $this->assertNotEmpty($user->createToken('integration-test')->plainTextToken);
    }

    public function test_two_players_can_share_and_join_a_community_post(): void
    {
        $this->postJson('/api.php?action=register', [
            'username' => 'QueueBuilderA',
            'password' => 'safe-example-password',
        ])->assertOk();

        $this->postJson('/api.php?action=community_post', [
            'kind' => 'collab',
            'title' => 'Queue test collaboration',
            'body' => 'A temporary collaboration post for feature coverage.',
        ])->assertOk();

        $this->postJson('/api.php?action=logout', [])->assertOk();
        $this->postJson('/api.php?action=register', [
            'username' => 'QueueBuilderB',
            'password' => 'safe-example-password',
        ])->assertOk()->assertJsonPath('player.username', 'QueueBuilderB');

        $feed = $this->getJson('/api.php?action=community_feed')
            ->assertOk()
            ->assertJsonPath('posts.0.title', 'Queue test collaboration');
        $postId = $feed->json('posts.0.id');

        $this->postJson('/api.php?action=community_join', ['post_id' => $postId])->assertOk()->assertJsonPath('joined', true);
        $this->postJson('/api.php?action=community_reply', [
            'post_id' => $postId,
            'message' => 'I can help with this build.',
        ])->assertOk();

        $this->postJson('/api.php?action=logout', [])->assertOk();
        $this->postJson('/api.php?action=login', [
            'username' => 'QueueBuilderA',
            'password' => 'safe-example-password',
        ])->assertOk()->assertJsonPath('player.username', 'QueueBuilderA');
        $this->getJson('/api.php?action=community_feed')
            ->assertOk()
            ->assertJsonPath('posts.0.member_count', 1)
            ->assertJsonPath('posts.0.replies.0.message', 'I can help with this build.');
    }
}
