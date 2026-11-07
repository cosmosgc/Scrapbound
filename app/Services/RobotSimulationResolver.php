<?php

namespace App\Services;

class RobotSimulationResolver
{
    private const HOME = ['x' => 0.0, 'z' => 1.5];

    private const SITES = [
        ['id' => 'east-cache', 'x' => 3.3, 'z' => 1.7, 'resource' => 'credits', 'stock' => 4],
        ['id' => 'north-cache', 'x' => -2.5, 'z' => -1.7, 'resource' => 'credits', 'stock' => 4],
        ['id' => 'west-pile', 'x' => -3.6, 'z' => 1.4, 'resource' => 'scrap', 'stock' => 5],
        ['id' => 'south-pile', 'x' => 2.5, 'z' => -1.8, 'resource' => 'scrap', 'stock' => 5],
    ];

    public function resolve(array $crew, array $assignments, int $seed, int $ticks, array $upgrades = [], ?array $rewards = null): array
    {
        $rewards ??= config('scrapbound.rewards');
        $nodes = $this->seedSites($seed);
        $programs = $assignments['units'] ?? [];
        $crewProgram = $assignments['crew'] ?? [];
        $robots = [];
        $id = 0;
        foreach (['scavenger', 'scrap_hound', 'fabricator'] as $kind) {
            for ($owned = 0; $owned < ($crew[$kind] ?? 0) && $id < 20; $owned++, $id++) {
                $robots[] = [
                    'id' => $id, 'kind' => $kind, 'x' => ($id % 3 - 1) * .5,
                    'z' => 1.5 + floor($id / 3) * .45,
                    'program' => $programs[$id] ?? $crewProgram, 'command' => 0,
                    'phase' => 'idle', 'target' => null, 'destination' => null,
                    'cargo' => 0, 'cargo_type' => 'credits', 'work' => 0.0, 'wait' => 0.0,
                ];
            }
        }

        $payouts = [];
        for ($step = 0; $step < $ticks; $step++) {
            foreach ($nodes as &$node) {
                if ($node['remaining'] <= 0) {
                    $node['respawn'] -= .1;
                    if ($node['respawn'] <= 0) {
                        $node['remaining'] = $node['stock'];
                        $node['scanned'] = false;
                    }
                }
            }
            unset($node);
            foreach ($robots as &$robot) {
                $this->stepRobot($robot, $nodes, .1, $upgrades, $rewards, $payouts);
            }
            unset($robot);
        }

        return ['payouts' => $payouts, 'robots' => array_map(fn (array $robot) => [
            'id' => $robot['id'], 'kind' => $robot['kind'], 'x' => $robot['x'], 'z' => $robot['z'],
            'phase' => $robot['phase'], 'cargo' => $robot['cargo'], 'status' => $robot['status'] ?? 'Ready',
        ], $robots), 'nodes' => array_map(fn (array $node) => [
            'id' => $node['id'], 'resource' => $node['resource'], 'remaining' => $node['remaining'], 'stock' => $node['stock'],
        ], $nodes)];
    }

    private function seedSites(int $seed): array
    {
        $state = $seed ?: 1;

        return array_map(function (array $site) use (&$state): array {
            $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;
            $stock = $site['stock'] + ($state % 3);

            return [...$site, 'stock' => $stock, 'remaining' => $stock, 'respawn' => 0.0, 'scanned' => false];
        }, self::SITES);
    }

    private function stepRobot(array &$robot, array &$nodes, float $dt, array $upgrades, array $rewards, array &$payouts): void
    {
        $program = $robot['program'];
        if (! $program && $robot['phase'] === 'idle') {
            $robot['status'] = 'Waiting for a program';

            return;
        }

        $safety = 0;
        while ($robot['phase'] === 'idle' && $safety++ < 8) {
            $step = $program[$robot['command'] % count($program)] ?? null;
            if (! $step) {
                return;
            }
            switch ($step['action']) {
                case 'patrol':
                    $resource = 'credits';
                    for ($i = $robot['command']; $i < count($program); $i++) {
                        if (($program[$i]['action'] ?? null) === 'collect') {
                            $resource = $program[$i]['resource'] ?? 'credits';
                            break;
                        }
                    }
                    $target = $this->findSite($robot, $nodes, $resource);
                    if ($target === null) {
                        $robot['status'] = 'No matching salvage nearby';

                        return;
                    }
                    $robot['target'] = $target;
                    $robot['phase'] = 'travel';
                    $robot['status'] = "Driving to {$resource} cache";
                    break;
                case 'scan':
                    $target = $robot['target'];
                    if ($target === null || $nodes[$target]['remaining'] <= 0) {
                        $this->next($robot);

                        continue 2;
                    }
                    $robot['work'] = .65;
                    $robot['phase'] = 'scan';
                    $robot['status'] = 'Scanning salvage';
                    break;
                case 'collect':
                    $target = $robot['target'];
                    if ($target === null || ! $nodes[$target]['scanned'] || $nodes[$target]['remaining'] <= 0) {
                        $this->next($robot);

                        continue 2;
                    }
                    $robot['cargo_type'] = $step['resource'] ?? 'credits';
                    $robot['work'] = 0.0;
                    $robot['phase'] = 'collect';
                    $robot['status'] = 'Collecting '.$robot['cargo_type'];
                    break;
                case 'move_to':
                    $robot['target'] = null;
                    $robot['destination'] = ['x' => (float) $step['x'], 'z' => (float) $step['z']];
                    $robot['phase'] = 'travel';
                    $robot['status'] = 'Moving to waypoint';
                    break;
                case 'return_home':
                    $robot['phase'] = 'return';
                    $robot['status'] = 'Returning to base';
                    break;
                case 'wait':
                    $robot['wait'] = (float) $step['seconds'];
                    $robot['phase'] = 'wait';
                    $robot['status'] = 'Waiting';
                    break;
                case 'if_cargo':
                    $this->next($robot, $robot['cargo'] > 0 ? 1 : $step['skip'] + 1);

                    continue 2;
                case 'if_site':
                    $available = false;
                    foreach ($nodes as $node) {
                        if ($node['resource'] === ($step['resource'] ?? 'credits') && $node['remaining'] > 0) {
                            $available = true;
                            break;
                        }
                    }
                    $this->next($robot, $available ? 1 : $step['skip'] + 1);

                    continue 2;
            }
        }

        if ($robot['phase'] === 'travel') {
            $destination = $robot['target'] !== null ? $nodes[$robot['target']] : $robot['destination'];
            if ($destination === null || ($robot['target'] !== null && $destination['remaining'] <= 0)) {
                $robot['target'] = null;
                $robot['phase'] = 'idle';

                return;
            }
            if ($this->moveToward($robot, $destination, $dt, $upgrades)) {
                $robot['destination'] = null;
                $robot['phase'] = 'idle';
                $this->next($robot);
            }
        } elseif ($robot['phase'] === 'scan') {
            $robot['work'] -= $dt;
            if ($robot['work'] <= 0) {
                if ($robot['target'] !== null && $nodes[$robot['target']]['remaining'] > 0) {
                    $nodes[$robot['target']]['scanned'] = true;
                }
                $robot['phase'] = 'idle';
                $this->next($robot);
            }
        } elseif ($robot['phase'] === 'collect') {
            $target = $robot['target'];
            if ($target === null || $nodes[$target]['remaining'] <= 0 || $robot['cargo'] >= $this->capacity($robot)) {
                if ($robot['cargo'] > 0) {
                    $robot['phase'] = 'return';
                    $robot['status'] = 'Returning with cargo';
                } else {
                    $robot['phase'] = 'idle';
                    $robot['target'] = null;
                    $this->next($robot);
                }

                return;
            }
            $rate = $robot['kind'] === 'scrap_hound' ? 1.7 : ($robot['kind'] === 'fabricator' ? .72 : 1.0);
            $robot['work'] += $dt * $rate * (! empty($upgrades['servo']) ? 1.25 : 1);
            while ($robot['work'] >= 1 && $nodes[$target]['remaining'] > 0 && $robot['cargo'] < $this->capacity($robot)) {
                $robot['work'] -= 1;
                $nodes[$target]['remaining']--;
                $robot['cargo']++;
            }
            if ($nodes[$target]['remaining'] <= 0) {
                $nodes[$target]['respawn'] = 5.0;
            }
            if ($robot['cargo'] >= $this->capacity($robot) || $nodes[$target]['remaining'] <= 0) {
                $robot['phase'] = 'return';
                $robot['status'] = 'Returning with cargo';
            }
        } elseif ($robot['phase'] === 'return') {
            if ($this->moveToward($robot, self::HOME, $dt, $upgrades)) {
                if ($robot['cargo'] > 0) {
                    $bonus = $robot['cargo_type'] === 'scrap' && ! empty($upgrades['magnet']) ? (float) $rewards['magnetScrapMultiplier'] : 1;
                    $payouts[] = [
                        'robot_id' => $robot['id'], 'resource' => $robot['cargo_type'],
                        'cargo' => $robot['cargo'], 'amount' => (int) floor($robot['cargo'] * ($robot['cargo_type'] === 'credits' ? $rewards['creditsPerCargo'] : $rewards['scrapPerCargo']) * $bonus),
                    ];
                }
                $robot['cargo'] = 0;
                $robot['target'] = null;
                $robot['phase'] = 'idle';
                $robot['status'] = 'Cargo delivered';
                $this->next($robot);
            }
        } elseif ($robot['phase'] === 'wait') {
            $robot['wait'] -= $dt;
            if ($robot['wait'] <= 0) {
                $robot['phase'] = 'idle';
                $this->next($robot);
            }
        }
    }

    private function findSite(array $robot, array $nodes, string $resource): ?int
    {
        $ids = [];
        foreach ($nodes as $index => $node) {
            if ($node['resource'] === $resource && $node['remaining'] > 0) {
                $ids[] = $index;
            }
        }
        usort($ids, fn (int $a, int $b) => hypot($nodes[$a]['x'] - $robot['x'], $nodes[$a]['z'] - $robot['z']) <=> hypot($nodes[$b]['x'] - $robot['x'], $nodes[$b]['z'] - $robot['z']));

        return $ids[0] ?? null;
    }

    private function capacity(array $robot): int
    {
        return $robot['kind'] === 'fabricator' ? 6 : 4;
    }

    private function next(array &$robot, int $amount = 1): void
    {
        $count = count($robot['program']);
        if ($count > 0) {
            $robot['command'] = ($robot['command'] + $amount) % $count;
        }
    }

    private function moveToward(array &$robot, array $destination, float $dt, array $upgrades): bool
    {
        $dx = $destination['x'] - $robot['x'];
        $dz = $destination['z'] - $robot['z'];
        $distance = hypot($dx, $dz);
        $speed = ($robot['kind'] === 'scrap_hound' ? 2.5 : 1.8) * (! empty($upgrades['servo']) ? 1.25 : 1);
        if ($distance <= $speed * $dt) {
            $robot['x'] = $destination['x'];
            $robot['z'] = $destination['z'];

            return true;
        }
        if ($distance > 0) {
            $robot['x'] += $dx / $distance * $speed * $dt;
            $robot['z'] += $dz / $distance * $speed * $dt;
        }

        return false;
    }
}
