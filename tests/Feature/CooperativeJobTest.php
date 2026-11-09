<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CooperativeJobService;
use App\Services\CurrencyLedger;
use App\Services\MissionResolver;
use App\Services\PlayerJobService;
use App\Services\PlayerMissionService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class CooperativeJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    private function pilot(string $username): User
    {
        $user = User::create(['username' => $username, 'password' => 'safe-example-password']);
        $user->assignRole('player');
        app(PlayerJobService::class)->ensurePlayer($user);
        app(CurrencyLedger::class)->walletFor($user);
        return $user;
    }

    public function test_cooperative_mission_contributions_complete_job_and_pay_contributors_once(): void
    {
        $owner = $this->pilot('CoopOwner');
        $member = $this->pilot('CoopMember');
        $service = app(CooperativeJobService::class);
        $jobId = $service->create($owner, 1, 2)['job_id'];
        $service->join($member, $jobId);

        $missionResult = [
            'success' => true, 'rewards' => ['credits' => 12, 'scrap' => 4], 'crew_count' => 1, 'sector' => 1,
            'events' => [], 'seed' => 1234, 'success_chance_percent' => 99, 'success_roll' => 1, 'duration_seconds' => 23,
            'crew' => [],
        ];
        $resolver = Mockery::mock(MissionResolver::class);
        $resolver->shouldReceive('resolve')->twice()->andReturn($missionResult);
        $this->app->instance(MissionResolver::class, $resolver);
        $missions = app(PlayerMissionService::class);
        $beforeOwner = app(CurrencyLedger::class)->walletFor($owner)->credits;
        $beforeMember = app(CurrencyLedger::class)->walletFor($member)->credits;
        $missions->start($owner, 1, 'coop-owner-run-001', $jobId);
        $missions->start($member, 1, 'coop-member-run-001', $jobId);
        $this->travel(30)->seconds();

        $first = $missions->claim($owner, 'coop-owner-run-001');
        $this->assertSame(['contributed' => true, 'completed' => false, 'progress' => 1, 'goal' => 2, 'reward_credits' => 0], $first['cooperative']);
        $this->assertDatabaseHas('cooperative_jobs', ['id' => $jobId, 'progress' => 1, 'status' => 'open']);
        try {
            $service->leave($owner, $jobId);
            $this->fail('A contributor must not be able to leave before job settlement.');
        } catch (\DomainException $exception) {
            $this->assertStringContainsString('owner cannot leave', $exception->getMessage());
        }

        $second = $missions->claim($member, 'coop-member-run-001');
        $this->assertTrue($second['cooperative']['completed']);
        $this->assertSame(35, $second['cooperative']['reward_credits']);
        $this->assertDatabaseHas('cooperative_jobs', ['id' => $jobId, 'progress' => 2, 'status' => 'completed']);
        $this->assertDatabaseCount('cooperative_job_contributions', 2);
        $this->assertDatabaseHas('currency_ledger_entries', ['user_id' => $owner->id, 'idempotency_key' => "coop:{$jobId}:user:{$owner->id}", 'reason' => 'cooperative_job_reward']);
        $this->assertDatabaseHas('currency_ledger_entries', ['user_id' => $member->id, 'idempotency_key' => "coop:{$jobId}:user:{$member->id}", 'reason' => 'cooperative_job_reward']);
        $this->assertSame($beforeOwner + 47, app(CurrencyLedger::class)->walletFor($owner)->credits);
        $this->assertSame($beforeMember + 47, app(CurrencyLedger::class)->walletFor($member)->credits);
        $this->assertContains('coop_completed', array_column($service->overview($owner)['notifications'], 'kind'));
        $this->assertDatabaseCount('season_standings', 0);

        $missions->claim($owner, 'coop-owner-run-001');
        $this->assertSame($beforeOwner + 47, app(CurrencyLedger::class)->walletFor($owner)->credits);
        $this->assertDatabaseCount('currency_ledger_entries', 10);
    }

    public function test_coop_job_member_can_leave_before_contributing_but_owner_cannot_and_full_jobs_reject_joiners(): void
    {
        $owner = $this->pilot('CoopOwnerRules');
        $one = $this->pilot('CoopOne');
        $two = $this->pilot('CoopTwo');
        $three = $this->pilot('CoopThree');
        $service = app(CooperativeJobService::class);
        $jobId = $service->create($owner, 1, 2)['job_id'];
        $service->join($one, $jobId);
        $this->assertTrue($service->leave($one, $jobId)['left']);
        $service->join($one, $jobId);
        $service->join($two, $jobId);
        $service->join($three, $jobId);
        $this->assertSame(4, $service->overview($one)['jobs'][0]['member_count']);
        $this->expectException(\DomainException::class);
        $service->join($this->pilot('CoopOverflow'), $jobId);
    }
}
