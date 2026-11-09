<?php

namespace App\Services;

use App\Models\PlayerIdleSettlementReceipt;
use App\Models\PlayerIdleState;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PlayerIdleProgressService
{
    public function __construct(
        private readonly PlayerJobService $jobs,
        private readonly RobotSimulationResolver $resolver,
        private readonly CurrencyLedger $ledger,
        private readonly GameCatalog $catalog,
        private readonly TechnologyTreeService $technology,
    ) {}

    public function settle(User $user, string $requestKey): array
    {
        return DB::transaction(function () use ($user, $requestKey): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $receipt = PlayerIdleSettlementReceipt::query()
                ->where('user_id', $user->id)->where('request_key', $requestKey)->first();
            if ($receipt) {
                return [...$receipt->result, 'replayed' => true];
            }

            $state = $this->stateForLockedUser($user);
            $now = now();
            $elapsed = max(0, $now->getTimestamp() - $state->last_settled_at->getTimestamp());
            $ticksPerSecond = max(1, (int) config('idle_progress.ticks_per_second', 10));
            $maxSeconds = max(0, (int) config('idle_progress.max_offline_seconds', 14400));
            $maxTicks = max(0, (int) config('idle_progress.max_ticks', $maxSeconds * $ticksPerSecond));
            $creditedSeconds = min($elapsed, $maxSeconds, (int) floor($maxTicks / $ticksPerSecond));
            $ticks = min($maxTicks, $creditedSeconds * $ticksPerSecond);

            $jobState = $this->jobs->jobs($user);
            $activeCatalog = $this->catalog->active();
            $crew = array_fill_keys(array_column($activeCatalog['items'], 'id'), 0);
            $units = [];
            foreach ($jobState['robots'] as $robot) {
                if (array_key_exists($robot['kind'], $crew)) $crew[$robot['kind']]++;
                $units[(int) $robot['id']] = $robot['program'];
            }
            $resolved = $this->resolver->resolve(
                $crew,
                ['crew' => [], 'units' => $units],
                (int) $state->world_seed,
                $ticks,
                [],
                $activeCatalog['rewards'],
                $activeCatalog['resources'],
                $this->technology->effectsFor($user),
            );

            $groups = [];
            foreach ($resolved['payouts'] as $payout) {
                $resource = $payout['resource'];
                $groups[$resource] ??= ['resource' => $resource, 'amount' => 0, 'deliveries' => 0];
                $groups[$resource]['amount'] += (int) $payout['amount'];
                $groups[$resource]['deliveries']++;
            }
            $wallet = $this->ledger->walletFor($user);
            $maximumReward = max(0, (int) config('idle_progress.max_reward_per_currency', 250000));
            foreach ($groups as $resource => &$group) {
                $group['amount'] = min($maximumReward, $group['amount']);
                if ($group['amount'] > 0) {
                    $mutation = $this->ledger->grant(
                        $user,
                        $resource,
                        $group['amount'],
                        "idle:{$requestKey}:{$resource}",
                        'offline_robot_delivery',
                        [
                            'request_key' => $requestKey,
                            'world_seed' => (int) $state->world_seed,
                            'credited_seconds' => $creditedSeconds,
                            'deliveries' => $group['deliveries'],
                        ],
                    );
                    $wallet = $mutation['wallet'];
                }
            }
            unset($group);

            $state->last_settled_at = $now;
            $state->save();
            $result = [
                'ok' => true,
                'world_seed' => (int) $state->world_seed,
                'elapsed_seconds' => $elapsed,
                'credited_seconds' => $creditedSeconds,
                'capped' => $elapsed > $creditedSeconds,
                'ticks' => $ticks,
                'payouts' => array_values($groups),
                'technology' => $this->technology->overview($user),
                'snapshot' => ['robots' => $resolved['robots'], 'nodes' => $resolved['nodes'], 'drops' => $resolved['drops']],
                'wallet' => ['credits' => $wallet->credits, 'scrap' => $wallet->scrap],
                'settled_at' => $now->toIso8601String(),
            ];
            PlayerIdleSettlementReceipt::create([
                'user_id' => $user->id,
                'request_key' => $requestKey,
                'input_hash' => hash('sha256', json_encode([
                    'world_seed' => (int) $state->world_seed,
                    'from' => $now->getTimestamp() - $elapsed,
                    'to' => $now->getTimestamp(),
                    'ticks' => $ticks,
                    'robots' => $jobState['robots'],
                ], JSON_THROW_ON_ERROR)),
                'result' => $result,
            ]);

            return [...$result, 'replayed' => false];
        });
    }

    public function stateForLockedUser(User $user): PlayerIdleState
    {
        $state = PlayerIdleState::query()->where('user_id', $user->id)->lockForUpdate()->first();
        if ($state) {
            return $state;
        }

        return PlayerIdleState::create([
            'user_id' => $user->id,
            'world_seed' => random_int(0, 0xFFFFFFFF),
            'last_settled_at' => Carbon::now(),
        ]);
    }
}
