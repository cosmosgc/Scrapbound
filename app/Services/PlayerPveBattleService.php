<?php

namespace App\Services;

use App\Models\PlayerPveBattle;
use App\Models\PlayerRobot;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class PlayerPveBattleService
{
    public function __construct(
        private readonly RobotProgramValidator $programs,
        private readonly GameCatalog $catalog,
        private readonly BattleResolver $resolver,
        private readonly CurrencyLedger $ledger,
    ) {}

    public function encounters(): array
    {
        return array_map(fn (array $encounter): array => array_intersect_key($encounter, array_flip(['id', 'name', 'tier', 'rating', 'credits'])), $this->validatedEncounters());
    }

    public function fight(User $user, int $unitIndex, string $encounterId, string $runKey): array
    {
        if (! preg_match('/^[A-Za-z0-9._:-]{8,40}$/', $runKey)) {
            throw new DomainException('Invalid PvE battle request key.');
        }
        $encounter = collect($this->validatedEncounters())->firstWhere('id', $encounterId);
        $robot = $user->robots()->where('unit_index', $unitIndex)->first();
        if (! $encounter || ! $robot) {
            throw new DomainException('Select an owned robot and an available NPC encounter.');
        }

        $attacker = ['user_id' => (int) $user->id, 'unit_index' => (int) $robot->unit_index, 'kind' => $robot->kind,
            'program' => $this->programs->validateProgram($robot->program ?? []), 'program_version' => (int) $robot->program_version];
        $npc = ['user_id' => 0, 'kind' => $encounter['kind'], 'program' => [], 'encounter_id' => $encounter['id'],
            'name' => $encounter['name'], 'tier' => $encounter['tier'], 'combat_stats' => $encounter['combat']];
        $catalogVersion = (int) $this->catalog->active()['version'];
        $inputHash = hash('sha256', json_encode([$user->id, $unitIndex, $attacker, $npc, $catalogVersion], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($user, $encounter, $runKey, $attacker, $npc, $catalogVersion, $inputHash): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $existing = PlayerPveBattle::query()->where('user_id', $user->id)->where('run_key', $runKey)->first();
            if ($existing) {
                if (! hash_equals($existing->input_hash, $inputHash)) {
                    throw new DomainException('PvE battle request key was already used for different inputs.');
                }
                return ['battle' => $this->battleData($existing), 'replayed' => true];
            }

            $seed = random_int(1, 2_147_483_647);
            $result = $this->resolver->resolve($seed, $attacker, $npc);
            $won = $result['winner_side'] === 'challenger';
            $reward = $won ? (int) $encounter['credits'] : 0;
            $result['winner_id'] = $won ? (int) $user->id : null;
            $result['rewards'] = ['winner_credits' => $reward];
            $battle = PlayerPveBattle::create(['user_id' => $user->id, 'run_key' => $runKey, 'input_hash' => $inputHash,
                'seed' => $seed, 'catalog_version' => $catalogVersion, 'encounter_id' => $encounter['id'],
                'attacker_snapshot' => $attacker, 'npc_snapshot' => $npc, 'result' => $result, 'created_at' => now()]);
            if ($won && $reward > 0) {
                $this->ledger->grant($user, 'credits', $reward, "pve-battle:{$battle->id}:winner", 'pve_battle_reward',
                    ['battle_id' => $battle->id, 'encounter_id' => $encounter['id']]);
            }

            return ['battle' => $this->battleData($battle), 'replayed' => false];
        });
    }

    public function history(User $user): array
    {
        return PlayerPveBattle::query()->where('user_id', $user->id)->latest('id')->limit(20)->get()->map(fn (PlayerPveBattle $battle) => $this->battleData($battle))->all();
    }

    private function battleData(PlayerPveBattle $battle): array
    {
        return ['id' => 'pve-'.$battle->id, 'mode' => 'pve', 'encounter' => $battle->npc_snapshot['name'] ?? $battle->encounter_id,
            'attacker' => ['kind' => $battle->attacker_snapshot['kind'], 'program' => $battle->attacker_snapshot['program']],
            'created_at' => $battle->created_at?->toIso8601String(), 'result' => $battle->result];
    }

    private function validatedEncounters(): array
    {
        $encounters = config('pve.encounters');
        if (! is_array($encounters) || ! array_is_list($encounters) || count($encounters) < 1 || count($encounters) > 50) {
            throw new DomainException('PvE encounter configuration is invalid.');
        }
        $ids = [];
        foreach ($encounters as $encounter) {
            if (! is_array($encounter) || ! is_string($encounter['id'] ?? null) || ! preg_match('/^[a-z][a-z0-9-]{1,39}$/', $encounter['id'])
                || in_array($encounter['id'], $ids, true) || ! is_string($encounter['name'] ?? null) || strlen($encounter['name']) > 60
                || ! is_int($encounter['tier'] ?? null) || $encounter['tier'] < 1 || $encounter['tier'] > 100
                || ! in_array($encounter['kind'] ?? null, ['scavenger', 'scrap_hound', 'fabricator'], true)
                || ! is_int($encounter['rating'] ?? null) || $encounter['rating'] < 0 || $encounter['rating'] > 100000000
                || ! is_int($encounter['credits'] ?? null) || $encounter['credits'] < 0 || $encounter['credits'] > 100000
                || ! is_array($encounter['combat'] ?? null)) {
                throw new DomainException('PvE encounter configuration contains invalid values.');
            }
            foreach (['hp', 'attack', 'armor'] as $stat) {
                if (! is_int($encounter['combat'][$stat] ?? null) || $encounter['combat'][$stat] < 0 || $encounter['combat'][$stat] > 1000) {
                    throw new DomainException('PvE encounter combat stats must be bounded non-negative integers.');
                }
            }
            $ids[] = $encounter['id'];
        }
        return $encounters;
    }
}
