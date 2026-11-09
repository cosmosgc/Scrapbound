<?php

namespace App\Services;

use App\Models\PlayerMissionProgress;
use App\Models\PlayerMissionRun;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class CooperativeJobService
{
    public function __construct(private readonly CurrencyLedger $ledger, private readonly GameCatalog $catalog) {}

    public function create(User $owner, int $sector, int $goal): array
    {
        $maximumSector = $this->catalog->active()['missionRules']['maximumSector'];
        $unlocked = PlayerMissionProgress::query()->where('user_id', $owner->id)->value('unlocked_sector') ?? 1;
        if ($sector < 1 || $sector > $maximumSector || $sector > $unlocked) {
            throw new DomainException('Co-op jobs must use a sector you have unlocked.');
        }
        if ($goal < 2 || $goal > (int) config('cooperative.maximum_goal', 4)) {
            throw new DomainException('Choose a contribution goal between two and four pilots.');
        }

        return DB::transaction(function () use ($owner, $sector, $goal): array {
            $jobId = DB::table('cooperative_jobs')->insertGetId([
                'owner_id' => $owner->id, 'sector' => $sector, 'goal' => $goal, 'progress' => 0,
                'status' => 'open', 'expires_at' => now()->addDays((int) config('cooperative.duration_days', 7)),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('cooperative_job_members')->insert(['job_id' => $jobId, 'user_id' => $owner->id, 'joined_at' => now()]);
            $this->notify($owner->id, 'coop_created', ['job_id' => $jobId, 'sector' => $sector]);
            return ['job_id' => $jobId, 'status' => 'open'];
        });
    }

    public function join(User $user, int $jobId): array
    {
        return DB::transaction(function () use ($user, $jobId): array {
            $job = DB::table('cooperative_jobs')->where('id', $jobId)->lockForUpdate()->first();
            $this->assertOpen($job);
            $member = DB::table('cooperative_job_members')->where('job_id', $jobId)->where('user_id', $user->id)->exists();
            if (! $member && DB::table('cooperative_job_members')->where('job_id', $jobId)->count() >= (int) config('cooperative.maximum_members', 4)) {
                throw new DomainException('This co-op job is full.');
            }
            if (! $member) {
                DB::table('cooperative_job_members')->insert(['job_id' => $jobId, 'user_id' => $user->id, 'joined_at' => now()]);
                $this->notify((int) $job->owner_id, 'coop_joined', ['job_id' => $jobId, 'username' => $user->username]);
            }
            return ['joined' => ! $member];
        });
    }

    public function leave(User $user, int $jobId): array
    {
        return DB::transaction(function () use ($user, $jobId): array {
            $job = DB::table('cooperative_jobs')->where('id', $jobId)->lockForUpdate()->first();
            $this->assertOpen($job);
            if ((int) $job->owner_id === (int) $user->id) {
                throw new DomainException('The job owner cannot leave their own co-op job.');
            }
            $member = DB::table('cooperative_job_members')->where('job_id', $jobId)->where('user_id', $user->id)->first();
            if (! $member) {
                throw new DomainException('You are not a member of this co-op job.');
            }
            if ((int) $member->contribution > 0) {
                throw new DomainException('You cannot leave after contributing to a co-op job.');
            }
            DB::table('cooperative_job_members')->where('job_id', $jobId)->where('user_id', $user->id)->delete();
            $this->notify((int) $job->owner_id, 'coop_left', ['job_id' => $jobId, 'username' => $user->username]);
            return ['left' => true];
        });
    }

    public function attachMission(User $user, int $jobId, int $sector): void
    {
        $job = DB::table('cooperative_jobs')->where('id', $jobId)->first();
        $this->assertOpen($job);
        if ((int) $job->sector !== $sector || ! DB::table('cooperative_job_members')->where('job_id', $jobId)->where('user_id', $user->id)->exists()) {
            throw new DomainException('Join an open co-op job for this sector before contributing a mission.');
        }
        if (DB::table('cooperative_job_members')->where('job_id', $jobId)->where('user_id', $user->id)->value('contribution') > 0) {
            throw new DomainException('You have already contributed to this co-op job.');
        }
    }

    public function contribute(User $user, PlayerMissionRun $run): ?array
    {
        if (! $run->cooperative_job_id) {
            return null;
        }
        $job = DB::table('cooperative_jobs')->where('id', $run->cooperative_job_id)->lockForUpdate()->first();
        $member = DB::table('cooperative_job_members')->where('job_id', $run->cooperative_job_id)->where('user_id', $user->id)->lockForUpdate()->first();
        if (! $member || ! $job || $job->status !== 'open' || now()->greaterThan($job->expires_at)) {
            if ($job && $job->status === 'open' && now()->greaterThan($job->expires_at)) {
                DB::table('cooperative_jobs')->where('id', $job->id)->update(['status' => 'expired', 'updated_at' => now()]);
            }
            return ['contributed' => false, 'status' => $job->status ?? 'expired'];
        }
        if ((int) $member->contribution > 0) {
            throw new DomainException('This pilot already contributed to the co-op job.');
        }

        DB::table('cooperative_job_contributions')->insert([
            'job_id' => $job->id, 'user_id' => $user->id, 'mission_run_id' => $run->id, 'amount' => 1, 'created_at' => now(),
        ]);
        DB::table('cooperative_job_members')->where('job_id', $job->id)->where('user_id', $user->id)->update(['contribution' => 1]);
        $progress = (int) $job->progress + 1;
        $completed = $progress >= (int) $job->goal;
        DB::table('cooperative_jobs')->where('id', $job->id)->update([
            'progress' => min($progress, (int) $job->goal), 'status' => $completed ? 'completed' : 'open',
            'completed_at' => $completed ? now() : null, 'updated_at' => now(),
        ]);
        $members = DB::table('cooperative_job_members')->where('job_id', $job->id)->where('contribution', '>', 0)->pluck('user_id')->all();
        foreach ($members as $memberId) {
            if ($completed) {
                $contributor = User::query()->find($memberId);
                if ($contributor) {
                    $this->ledger->grant($contributor, 'credits', (int) config('cooperative.contributor_credits', 35),
                        "coop:{$job->id}:user:{$memberId}", 'cooperative_job_reward', ['job_id' => (int) $job->id]);
                }
                $this->notify((int) $memberId, 'coop_completed', ['job_id' => (int) $job->id, 'reward' => (int) config('cooperative.contributor_credits', 35)]);
            } elseif ((int) $memberId !== (int) $user->id) {
                $this->notify((int) $memberId, 'coop_contribution', ['job_id' => (int) $job->id, 'progress' => $progress, 'goal' => (int) $job->goal]);
            }
        }
        return ['contributed' => true, 'completed' => $completed, 'progress' => min($progress, (int) $job->goal), 'goal' => (int) $job->goal,
            'reward_credits' => $completed ? (int) config('cooperative.contributor_credits', 35) : 0];
    }

    public function overview(User $user): array
    {
        $jobs = DB::table('cooperative_jobs')->join('users as owners', 'owners.id', '=', 'cooperative_jobs.owner_id')
            ->leftJoin('cooperative_job_members', function ($join) use ($user): void {
                $join->on('cooperative_job_members.job_id', '=', 'cooperative_jobs.id')->where('cooperative_job_members.user_id', '=', $user->id);
            })
            ->whereIn('cooperative_jobs.status', ['open', 'completed'])->where('cooperative_jobs.expires_at', '>', now()->subDay())
            ->orderByDesc('cooperative_jobs.id')->limit(30)
            ->get(['cooperative_jobs.id', 'cooperative_jobs.owner_id', 'owners.username as owner', 'cooperative_jobs.sector', 'cooperative_jobs.goal',
                'cooperative_jobs.progress', 'cooperative_jobs.status', 'cooperative_jobs.expires_at', 'cooperative_job_members.user_id as member_id', 'cooperative_job_members.contribution'])
            ->map(function ($job): array {
                $job->members = DB::table('cooperative_job_members')->join('users', 'users.id', '=', 'cooperative_job_members.user_id')
                    ->where('job_id', $job->id)->orderBy('joined_at')->get(['users.username', 'cooperative_job_members.contribution']);
                $job->member_count = $job->members->count();
                return (array) $job;
            })->all();
        $notifications = DB::table('player_notifications')->where('user_id', $user->id)->latest('id')->limit(20)->get()
            ->map(fn ($note): array => ['id' => $note->id, 'kind' => $note->kind, 'data' => json_decode($note->data, true), 'created_at' => $note->created_at])->all();
        return ['ok' => true, 'jobs' => $jobs, 'notifications' => $notifications];
    }

    private function assertOpen(?object $job): void
    {
        if (! $job || $job->status !== 'open' || now()->greaterThan($job->expires_at)) {
            throw new DomainException('This co-op job is unavailable or has expired.');
        }
    }

    private function notify(int $userId, string $kind, array $data): void
    {
        DB::table('player_notifications')->insert(['user_id' => $userId, 'kind' => $kind, 'data' => json_encode($data, JSON_THROW_ON_ERROR),
            'created_at' => now(), 'updated_at' => now()]);
    }
}
