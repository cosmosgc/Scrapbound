<?php

namespace App\Services;

class BattleResolver
{
    public function resolve(int $seed, array $attacker, array $defender): array
    {
        $state = $seed ?: 1;
        $attackerStats = $this->stats($attacker);
        $defenderStats = $this->stats($defender);
        $hp = [$attackerStats['hp'], $defenderStats['hp']];
        $sides = [$attacker, $defender];
        $stats = [$attackerStats, $defenderStats];
        $events = [['round' => 0, 'type' => 'deploy', 'label' => 'Both defense snapshots deployed to the arena.']];
        $round = 0;

        while ($round < 10 && $hp[0] > 0 && $hp[1] > 0) {
            $round++;
            foreach ([0, 1] as $turn) {
                $target = 1 - $turn;
                if ($hp[$target] <= 0) {
                    break;
                }
                $variance = $this->roll($state) % 8;
                $damage = max(1, $stats[$turn]['attack'] + $variance - $stats[$target]['armor']);
                $hp[$target] = max(0, $hp[$target] - $damage);
                $events[] = [
                    'round' => $round,
                    'type' => 'strike',
                    'attacker' => $turn === 0 ? 'challenger' : 'defender',
                    'damage' => $damage,
                    'remaining_hp' => $hp[$target],
                    'label' => ($turn === 0 ? 'Challenger' : 'Defender')." landed {$damage} damage.",
                ];
            }
        }

        if ($hp[0] === $hp[1]) {
            $winner = $this->roll($state) % 2;
        } else {
            $winner = $hp[0] > $hp[1] ? 0 : 1;
        }
        $winnerId = (int) $sides[$winner]['user_id'];
        $events[] = ['round' => $round, 'type' => 'result', 'winner' => $winner === 0 ? 'challenger' : 'defender', 'label' => $winner === 0 ? 'Challenger wins the match.' : 'Defender holds the arena.'];

        return [
            'resolver_version' => 'battle-v1',
            'winner_id' => $winnerId,
            'winner_side' => $winner === 0 ? 'challenger' : 'defender',
            'rounds' => $round,
            'final_hp' => ['challenger' => $hp[0], 'defender' => $hp[1]],
            'rewards' => ['winner_credits' => 25],
            'events' => array_slice($events, 0, 22),
            'seed' => $seed,
        ];
    }

    private function stats(array $loadout): array
    {
        if (isset($loadout['combat_stats']) && is_array($loadout['combat_stats'])) {
            return $loadout['combat_stats'];
        }
        $base = match ($loadout['kind'] ?? null) {
            'scrap_hound' => ['hp' => 82, 'attack' => 22, 'armor' => 3],
            'fabricator' => ['hp' => 132, 'attack' => 14, 'armor' => 8],
            default => ['hp' => 100, 'attack' => 18, 'armor' => 5],
        };
        $actions = array_column($loadout['program'] ?? [], 'action');
        $base['attack'] += min(4, count(array_filter($actions, fn (string $action) => $action === 'scan')) * 2);
        $base['armor'] += min(2, count(array_filter($actions, fn (string $action) => $action === 'wait')));

        return $base;
    }

    private function roll(int &$state): int
    {
        $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

        return $state;
    }
}
