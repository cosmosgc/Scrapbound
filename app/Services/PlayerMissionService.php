<?php

namespace App\Services;

use App\Models\PlayerMissionProgress;
use App\Models\PlayerMissionRun;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

class PlayerMissionService
{
    public function __construct(
        private readonly PlayerJobService $jobs,
        private readonly CurrencyLedger $ledger,
        private readonly GameCatalog $catalog,
        private readonly MissionResolver $resolver,
    ) {}

    public function overview(User $user): array
    {
        $jobState = $this->jobs->jobs($user);
        $progress = PlayerMissionProgress::firstOrCreate(['user_id' => $user->id], ['unlocked_sector' => 1]);
        $rules = $this->catalog->active()['missionRules'];
        $crew = $this->eligibleCrew($jobState['robots']->all(), $rules);
        $active = PlayerMissionRun::query()->where('user_id', $user->id)->where('status', 'active')->first();
        $sector = $progress->unlocked_sector;
        $contracts = [];
        for ($number = $sector; $number <= min((int) $rules['maximumSector'], $sector + 2); $number++) {
            $contracts[] = [
                'sector' => $number,
                'unlocked' => $number <= $sector,
                'crew_required' => (int) $rules['minimumCrew'],
                'duration_seconds' => $this->durationFor($number, $rules),
                'reward_preview' => $this->preview($number, count($crew), $this->catalog->active()['rewards']),
            ];
        }

        return [
            'unlocked_sector' => $sector,
            'crew_count' => count($crew),
            'contracts' => $contracts,
            'active_run' => $active ? $this->activeRunData($active) : null,
            'wallet' => $jobState['wallet'],
        ];
    }

    public function start(User $user, int $sector, string $runKey): array
    {
        return DB::transaction(function () use ($user, $sector, $runKey): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $catalog = $this->catalog->active();
            $progress = PlayerMissionProgress::firstOrCreate(['user_id' => $user->id], ['unlocked_sector' => 1]);
            if ($sector < 1 || $sector > $catalog['missionRules']['maximumSector'] || $sector > $progress->unlocked_sector) {
                throw new DomainException('That mission sector is locked or outside the configured range.');
            }

            $jobState = $this->jobs->jobs($user);
            $crew = $this->eligibleCrew($jobState['robots']->all(), $catalog['missionRules']);
            if (count($crew) < $catalog['missionRules']['minimumCrew']) {
                throw new DomainException('Assign a valid program to at least one owned robot before launching a mission.');
            }
            $inputHash = hash('sha256', json_encode([
                'sector' => $sector,
                'crew' => array_map(fn (array $robot) => [
                    'id' => $robot['id'], 'kind' => $robot['kind'], 'program_version' => $robot['program_version'],
                    'program' => $robot['program'],
                ], $crew),
            ], JSON_THROW_ON_ERROR));

            $existing = PlayerMissionRun::query()->where('user_id', $user->id)->where('run_key', $runKey)->first();
            if ($existing) {
                if ($existing->sector !== $sector || ! hash_equals($existing->input_hash, $inputHash)) {
                    throw new DomainException('Mission key was already used for different mission inputs.');
                }

                return ['run' => $this->activeRunData($existing), 'replayed' => true];
            }
            if (PlayerMissionRun::query()->where('user_id', $user->id)->where('status', 'active')->exists()) {
                throw new DomainException('Finish or claim your active mission before deploying another crew.');
            }

            $rateKey = 'mission-start:'.$user->id;
            $limit = (int) $catalog['missionRules']['maximumStartsPerHour'];
            if (RateLimiter::tooManyAttempts($rateKey, $limit)) {
                throw new DomainException('Mission launch limit reached. Try again later.');
            }
            RateLimiter::hit($rateKey, 3600);

            $duration = $this->durationFor($sector, $catalog['missionRules']);
            $now = now();
            $run = PlayerMissionRun::create([
                'user_id' => $user->id,
                'run_key' => $runKey,
                'input_hash' => $inputHash,
                'sector' => $sector,
                'seed' => random_int(1, 4294967295),
                'catalog_version' => $catalog['version'],
                'catalog_snapshot' => ['rewards' => $catalog['rewards'], 'missionRules' => $catalog['missionRules']],
                'duration_seconds' => $duration,
                'crew_snapshot' => $crew,
                'status' => 'active',
                'started_at' => $now,
                'completes_at' => $now->copy()->addSeconds($duration),
            ]);

            return ['run' => $this->activeRunData($run), 'replayed' => false];
        });
    }

    public function claim(User $user, string $runKey): array
    {
        return DB::transaction(function () use ($user, $runKey): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $run = PlayerMissionRun::query()->where('user_id', $user->id)->where('run_key', $runKey)->lockForUpdate()->firstOrFail();
            if ($run->status === 'claimed') {
                return [...$run->result, 'replayed' => true];
            }
            if (now()->lt($run->completes_at)) {
                throw new DomainException('Mission is still underway.');
            }

            $catalog = $run->catalog_snapshot ?? $this->catalog->active();
            $result = $this->resolver->resolve(
                $run->seed, $run->sector, $run->crew_snapshot, $catalog['rewards'], $catalog['missionRules'], $run->duration_seconds,
            );
            $wallet = $this->ledger->walletFor($user);
            if ($result['success']) {
                foreach (['credits', 'scrap'] as $resource) {
                    $amount = (int) $result['rewards'][$resource];
                    if ($amount < 1) {
                        continue;
                    }
                    $mutation = $this->ledger->grant(
                        $user, $resource, $amount,
                        'mission:'.substr(hash('sha256', $run->run_key.':'.$resource), 0, 56),
                        'mission_delivery', ['run_key' => $run->run_key, 'sector' => $run->sector],
                    );
                    $wallet = $mutation['wallet'];
                }
                $progress = PlayerMissionProgress::firstOrCreate(['user_id' => $user->id], ['unlocked_sector' => 1]);
                $progress->unlocked_sector = min(
                    (int) $catalog['missionRules']['maximumSector'],
                    max($progress->unlocked_sector, $run->sector + 1),
                );
                $progress->save();
            }

            $result['run_key'] = $run->run_key;
            $result['wallet'] = ['credits' => $wallet->credits, 'scrap' => $wallet->scrap];
            $result['unlocked_sector'] = PlayerMissionProgress::query()->where('user_id', $user->id)->value('unlocked_sector') ?? 1;
            $run->forceFill(['status' => 'claimed', 'claimed_at' => now(), 'result' => $result])->save();

            return [...$result, 'replayed' => false];
        });
    }

    private function eligibleCrew(array $robots, array $rules): array
    {
        return array_slice(array_values(array_filter(
            $robots,
            fn (array $robot) => count($robot['program']) > 0,
        )), 0, (int) $rules['maximumCrew']);
    }

    private function durationFor(int $sector, array $rules): int
    {
        return min(
            (int) $rules['maximumDurationSeconds'],
            (int) $rules['baseDurationSeconds'] + $sector * (int) $rules['secondsPerSector'],
        );
    }

    private function preview(int $sector, int $crewCount, array $rewards): array
    {
        return [
            'credits' => (int) $rewards['missionBaseCredits'] + $sector * (int) $rewards['missionCreditsPerSector'] + $crewCount * (int) $rewards['missionCreditsPerRobot'],
            'scrap' => (int) $rewards['missionBaseScrap'] + $sector * (int) $rewards['missionScrapPerSector'] + $crewCount * (int) $rewards['missionScrapPerRobot'],
        ];
    }

    private function activeRunData(PlayerMissionRun $run): array
    {
        return [
            'run_key' => $run->run_key, 'sector' => $run->sector, 'duration_seconds' => $run->duration_seconds,
            'started_at' => $run->started_at?->toIso8601String(), 'completes_at' => $run->completes_at?->toIso8601String(),
            'status' => $run->status,
        ];
    }
}
