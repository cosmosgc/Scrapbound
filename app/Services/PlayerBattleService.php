<?php

namespace App\Services;

use App\Models\PlayerBattle;
use App\Models\PlayerBattleDefense;
use App\Models\PlayerRobot;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class PlayerBattleService
{
    public function __construct(
        private readonly RobotProgramValidator $programs,
        private readonly GameCatalog $catalog,
        private readonly BattleResolver $resolver,
        private readonly CurrencyLedger $ledger,
    ) {}

    public function publishDefense(User $user, int $unitIndex): array
    {
        $robot = $user->robots()->where('unit_index', $unitIndex)->first();
        if (! $robot) {
            throw new DomainException('Select a robot you own.');
        }
        $snapshot = $this->snapshot($user, $robot);
        $catalogVersion = $this->catalog->active()['version'];

        PlayerBattleDefense::updateOrCreate(
            ['user_id' => $user->id],
            ['robot_snapshot' => $snapshot, 'catalog_version' => $catalogVersion],
        );

        return ['published' => true, 'catalog_version' => $catalogVersion, 'robot' => $this->publicSnapshot($snapshot)];
    }

    public function defenses(?int $exceptUserId = null): array
    {
        return PlayerBattleDefense::query()->with('user:id,username')
            ->when($exceptUserId, fn ($query) => $query->where('user_id', '!=', $exceptUserId))
            ->latest('updated_at')->limit(50)->get()
            ->map(fn (PlayerBattleDefense $defense) => [
                'user_id' => $defense->user_id,
                'username' => $defense->user?->username ?? 'Unknown pilot',
                'catalog_version' => $defense->catalog_version,
                'updated_at' => $defense->updated_at?->toIso8601String(),
                'robot' => $this->publicSnapshot($defense->robot_snapshot),
            ])->all();
    }

    public function challenge(User $challenger, int $defenderId, int $unitIndex, string $runKey): array
    {
        if ($challenger->id === $defenderId) {
            throw new DomainException('You cannot challenge your own defense.');
        }
        if (! preg_match('/^[A-Za-z0-9._:-]{8,40}$/', $runKey)) {
            throw new DomainException('Invalid battle request key.');
        }

        $robot = $challenger->robots()->where('unit_index', $unitIndex)->first();
        $defense = PlayerBattleDefense::query()->whereKey($defenderId)->first();
        if (! $robot || ! $defense) {
            throw new DomainException('That robot or defense snapshot is unavailable.');
        }
        $attackerSnapshot = $this->snapshot($challenger, $robot);
        $defenderSnapshot = $defense->robot_snapshot;
        $requestHash = hash('sha256', json_encode([
            'challenger' => $challenger->id,
            'defender' => $defenderId,
            'unit_index' => $unitIndex,
            'attacker' => $attackerSnapshot,
            'defender' => $defenderSnapshot,
            'catalog_version' => $defense->catalog_version,
        ], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($challenger, $defenderId, $runKey, $attackerSnapshot, $defenderSnapshot, $defense, $requestHash): array {
            User::query()->whereIn('id', [$challenger->id, $defenderId])->orderBy('id')->lockForUpdate()->get();
            $existing = PlayerBattle::query()->where('challenger_id', $challenger->id)->where('run_key', $runKey)->first();
            if ($existing) {
                if (! hash_equals($existing->input_hash, $requestHash)) {
                    throw new DomainException('Battle request key was already used for different inputs.');
                }

                return ['battle' => $this->battleData($existing), 'replayed' => true];
            }

            $pairRecentlyMatched = PlayerBattle::query()
                ->where('created_at', '>=', now()->subHours(24))
                ->where(function ($query) use ($challenger, $defenderId): void {
                    $query->where(function ($pair) use ($challenger, $defenderId): void {
                        $pair->where('challenger_id', $challenger->id)->where('defender_id', $defenderId);
                    })->orWhere(function ($pair) use ($challenger, $defenderId): void {
                        $pair->where('challenger_id', $defenderId)->where('defender_id', $challenger->id);
                    });
                })
                ->exists();
            if ($pairRecentlyMatched) {
                throw new DomainException('These pilots can only battle once every 24 hours.');
            }

            $seed = random_int(1, 2_147_483_647);
            $result = $this->resolver->resolve($seed, $attackerSnapshot, $defenderSnapshot);
            $battle = PlayerBattle::create([
                'challenger_id' => $challenger->id,
                'defender_id' => $defenderId,
                'run_key' => $runKey,
                'input_hash' => $requestHash,
                'seed' => $seed,
                'catalog_version' => $defense->catalog_version,
                'attacker_snapshot' => $attackerSnapshot,
                'defender_snapshot' => $defenderSnapshot,
                'result' => $result,
                'created_at' => now(),
            ]);
            $winner = User::query()->whereKey($result['winner_id'])->firstOrFail();
            $this->ledger->grant(
                $winner,
                'credits',
                25,
                "battle:{$battle->id}:winner",
                'battle_reward',
                ['battle_id' => $battle->id, 'winner_id' => $winner->id],
            );
            app(CompetitiveProgression::class)->recordBattle($challenger->id, $defenderId, $result['winner_id']);

            return ['battle' => $this->battleData($battle), 'progression' => app(CompetitiveProgression::class)->playerSummary($challenger), 'replayed' => false];
        });
    }

    public function history(User $user): array
    {
        return PlayerBattle::query()->where(fn ($query) => $query->where('challenger_id', $user->id)->orWhere('defender_id', $user->id))
            ->latest('id')->limit(30)->get()->map(fn (PlayerBattle $battle) => $this->battleData($battle))->all();
    }

    public function progression(User $user): array
    {
        return app(CompetitiveProgression::class)->overview($user);
    }

    private function snapshot(User $user, PlayerRobot $robot): array
    {
        return [
            'user_id' => (int) $user->id,
            'unit_index' => (int) $robot->unit_index,
            'kind' => $robot->kind,
            'program' => $this->programs->validateProgram($robot->program ?? []),
            'program_version' => (int) $robot->program_version,
        ];
    }

    private function publicSnapshot(array $snapshot): array
    {
        return ['kind' => $snapshot['kind'], 'program' => $snapshot['program']];
    }

    private function battleData(PlayerBattle $battle): array
    {
        return [
            'id' => $battle->id,
            'challenger_id' => $battle->challenger_id,
            'defender_id' => $battle->defender_id,
            'created_at' => $battle->created_at?->toIso8601String(),
            'attacker' => $this->publicSnapshot($battle->attacker_snapshot),
            'defender' => $this->publicSnapshot($battle->defender_snapshot),
            'result' => $battle->result,
        ];
    }
}
