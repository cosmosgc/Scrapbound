<?php

namespace App\Services;

class RobotSimulationResolver
{
    private const HOME = ['x' => 0.0, 'z' => 0.0];
    private const NAVIGATION_OBSTACLES = [
        ['x' => -4.7, 'z' => 1.7, 'radius' => .78],
        ['x' => 4.35, 'z' => 1.6, 'radius' => .78],
        ['x' => -4.4, 'z' => -2.6, 'radius' => .78],
        ['x' => -3.8, 'z' => -1.8, 'radius' => .45],
        ['x' => 3.8, 'z' => -1.8, 'radius' => .45],
    ];

    public function resolve(array $crew, array $assignments, int $seed, int $ticks, array $upgrades = [], ?array $rewards = null, ?array $resources = null, array $technologyEffects = []): array
    {
        $rewards ??= config('scrapbound.rewards');
        $resources ??= config('scrapbound.resources', []);
        $nodes = $this->seedSites($seed, $resources, $technologyEffects);
        $programs = $assignments['units'] ?? [];
        $crewProgram = $assignments['crew'] ?? [];
        $robots = [];
        $id = 0;
        foreach (['scavenger', 'scrap_hound', 'fabricator'] as $kind) {
            for ($owned = 0; $owned < ($crew[$kind] ?? 0) && $id < 20; $owned++, $id++) {
                $robots[] = [
                    'id' => $id, 'kind' => $kind, 'x' => ($id % 3 - 1) * .85,
                    'z' => 1.1 + floor($id / 3) * .8,
                    'program' => $programs[$id] ?? $crewProgram, 'command' => 0,
                    'phase' => 'idle', 'target' => null, 'destination' => null,
                    'cargo' => 0, 'cargo_type' => 'credits', 'work' => 0.0, 'wait' => 0.0,
                    'navigation_goal' => null, 'best_distance' => null, 'stalled_ticks' => 0,
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
                $this->stepRobot($robot, $nodes, .1, $upgrades, $rewards, $resources, $technologyEffects, $robots, $payouts);
            }
            unset($robot);
        }

        return ['payouts' => $payouts, 'robots' => array_map(fn (array $robot) => [
            'id' => $robot['id'], 'kind' => $robot['kind'], 'x' => $robot['x'], 'z' => $robot['z'],
            'phase' => $robot['phase'], 'cargo' => $robot['cargo'], 'status' => $robot['status'] ?? 'Ready',
        ], $robots), 'nodes' => array_map(fn (array $node) => [
            'id' => $node['id'], 'resource' => $node['resource'], 'remaining' => $node['remaining'], 'stock' => $node['stock'],
            'x' => $node['x'], 'z' => $node['z'], 'respawnSeconds' => $node['respawn_duration'],
        ], $nodes)];
    }

    private function seedSites(int $seed, array $resources, array $technologyEffects): array
    {
        $state = $seed;
        $slots = [];
        for ($z = -9; $z <= 9; $z++) {
            for ($x = -15; $x <= 15; $x++) {
                // Keep all resource sites outside the central depot/platform area.
                if (abs($x) <= 6 && abs($z) <= 4) {
                    continue;
                }
                if ($this->blockedByObstacle($x, $z, self::NAVIGATION_OBSTACLES, .3)) {
                    continue;
                }
                $slots[] = ['x' => $x, 'z' => $z];
            }
        }
        for ($index = count($slots) - 1; $index > 0; $index--) {
            $swap = (int) floor($this->nextRandom($state) * ($index + 1));
            [$slots[$index], $slots[$swap]] = [$slots[$swap], $slots[$index]];
        }

        $unlockedResources = $technologyEffects['unlockResources'] ?? [];
        $unlockedZones = array_values(array_unique(['frontier', ...($technologyEffects['unlockZones'] ?? [])]));
        $eligibleResources = array_values(array_filter($resources, static fn (array $resource): bool =>
            (! isset($resource['unlockNode']) || in_array($resource['id'], $unlockedResources, true))
            && (! isset($resource['zone']) || in_array($resource['zone'], $unlockedZones, true))
        ));
        $sites = [];
        foreach (array_slice($slots, 0, 8) as $index => $slot) {
            $totalWeight = 0.0;
            foreach ($eligibleResources as $definition) {
                $totalWeight += (float) $definition['spawnWeight'] * (float) ($technologyEffects['spawnWeightMultipliers'][$definition['id']] ?? 1);
            }
            $roll = $this->nextRandom($state) * $totalWeight;
            $resource = $eligibleResources[0];
            foreach ($eligibleResources as $definition) {
                $roll -= (float) $definition['spawnWeight'] * (float) ($technologyEffects['spawnWeightMultipliers'][$definition['id']] ?? 1);
                if ($roll < 0) {
                    $resource = $definition;
                    break;
                }
            }
            $stock = (int) $resource['minStock'] + (int) floor($this->nextRandom($state) * ((int) $resource['maxStock'] - (int) $resource['minStock'] + 1));
            $stock = min(1000, (int) ceil($stock * (float) ($technologyEffects['stockMultipliers'][$resource['id']] ?? 1)));
            $respawnDuration = (float) $resource['respawnSeconds'] * (float) ($technologyEffects['respawnTimeMultipliers'][$resource['id']] ?? 1);
            $sites[] = [
                'id' => "site-{$index}", 'x' => $slot['x'], 'z' => $slot['z'],
                'resource' => $resource['id'], 'stock' => $stock, 'remaining' => $stock,
                'respawn' => 0.0, 'respawn_duration' => $respawnDuration, 'scanned' => false,
            ];
        }

        return $sites;
    }

    private function nextRandom(int &$state): float
    {
        $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

        return $state / 4294967296;
    }

    private function stepRobot(array &$robot, array &$nodes, float $dt, array $upgrades, array $rewards, array $resources, array $technologyEffects, array &$robots, array &$payouts): void
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
            if ($this->moveToward($robot, $destination, $dt, $upgrades, $robots, $technologyEffects)) {
                $robot['destination'] = null;
                $robot['phase'] = 'idle';
                $this->next($robot);
                $robot['navigation_goal'] = null;
                $robot['best_distance'] = null;
                $robot['stalled_ticks'] = 0;
            } elseif ($this->updateNavigationProgress($robot, $destination)) {
                if ($robot['cargo'] === 0) {
                    $robot['target'] = null;
                    $robot['destination'] = null;
                    $robot['phase'] = 'idle';
                    $robot['status'] = 'Route blocked; replanning';
                    $robot['navigation_goal'] = null;
                    $robot['best_distance'] = null;
                    $robot['stalled_ticks'] = 0;
                    $this->next($robot);
                } else {
                    $robot['status'] = 'Waiting for a clear route with cargo';
                }
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
                $nodes[$target]['respawn'] = $nodes[$target]['respawn_duration'];
            }
            if ($robot['cargo'] >= $this->capacity($robot) || $nodes[$target]['remaining'] <= 0) {
                $robot['phase'] = 'return';
                $robot['status'] = 'Returning with cargo';
            }
        } elseif ($robot['phase'] === 'return') {
            if ($this->moveToward($robot, self::HOME, $dt, $upgrades, $robots, $technologyEffects)) {
                if ($robot['cargo'] > 0) {
                    $definition = collect($resources)->firstWhere('id', $robot['cargo_type']);
                    $currency = $definition['currency'] ?? $robot['cargo_type'];
                    $value = (int) ($definition['valuePerCargo'] ?? ($robot['cargo_type'] === 'scrap' ? $rewards['scrapPerCargo'] : $rewards['creditsPerCargo']));
                    $bonus = $robot['cargo_type'] === 'scrap' && ! empty($upgrades['magnet']) ? (float) $rewards['magnetScrapMultiplier'] : 1;
                    $bonus *= (float) ($technologyEffects['deliveryValueMultipliers'][$robot['cargo_type']] ?? 1);
                    $payouts[] = [
                        'robot_id' => $robot['id'], 'resource' => $currency, 'cargo_resource' => $robot['cargo_type'],
                        'cargo' => $robot['cargo'], 'amount' => (int) floor($robot['cargo'] * $value * $bonus),
                    ];
                }
                $robot['cargo'] = 0;
                $robot['target'] = null;
                $robot['phase'] = 'idle';
                $robot['status'] = 'Cargo delivered';
                $this->next($robot);
                $robot['navigation_goal'] = null;
                $robot['best_distance'] = null;
                $robot['stalled_ticks'] = 0;
            } elseif ($this->updateNavigationProgress($robot, self::HOME)) {
                $robot['status'] = 'Waiting for a clear depot approach';
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

    private function moveToward(array &$robot, array $destination, float $dt, array $upgrades, array $robots, array $technologyEffects): bool
    {
        $usesBerth = $robot['target'] !== null || $robot['phase'] === 'return'
            || ($robot['phase'] === 'travel' && count($robots) > 1);
        if ($usesBerth) {
            if ($robot['id'] > 0) {
                $angle = $robot['id'] * 2.399963229728653;
                $destination = ['x' => $destination['x'] + cos($angle) * .8, 'z' => $destination['z'] + sin($angle) * .8];
            }
        }
        $dx = $destination['x'] - $robot['x'];
        $dz = $destination['z'] - $robot['z'];
        $distance = hypot($dx, $dz);
        $speed = ($robot['kind'] === 'scrap_hound' ? 2.5 : 1.8) * (! empty($upgrades['servo']) ? 1.25 : 1);
        if ($distance <= 0.000001) {
            return true;
        }

        $directCompletion = $distance <= $speed * $dt;
        $step = min($speed * $dt, $distance);
        $angle = atan2($dz, $dx);
        $side = $robot['id'] % 2 === 0 ? 1 : -1;
        $offsets = [0.0];
        for ($turn = 1; $turn <= 8; $turn++) {
            $offsets[] = $side * $turn * .35;
            $offsets[] = -$side * $turn * .35;
        }
        $offsets[] = M_PI;
        foreach ($offsets as $offset) {
            $nextX = $directCompletion && $offset === 0.0 ? $destination['x'] : $robot['x'] + cos($angle + $offset) * $step;
            $nextZ = $directCompletion && $offset === 0.0 ? $destination['z'] : $robot['z'] + sin($angle + $offset) * $step;
            if (abs($nextX) > 16 || abs($nextZ) > 10) {
                continue;
            }
            $clear = ! $this->blockedByObstacle($nextX, $nextZ, $this->obstaclesFor($technologyEffects));
            foreach ($robots as $other) {
                if (! $clear) {
                    break;
                }
                if ($other['id'] === $robot['id']) {
                    continue;
                }
                if (hypot($nextX - $other['x'], $nextZ - $other['z']) < .65) {
                    $clear = false;
                    break;
                }
            }
            if (! $clear) {
                continue;
            }
            $robot['x'] = $nextX;
            $robot['z'] = $nextZ;

            return $directCompletion && $offset === 0.0;
        }

        return false;
    }

    private function obstaclesFor(array $technologyEffects): array
    {
        $obstacles = self::NAVIGATION_OBSTACLES;
        if (in_array('survey_beacon', $technologyEffects['sceneUnlocks'] ?? [], true)) {
            $obstacles[] = ['x' => -3.1, 'z' => 1.9, 'radius' => .4];
        }
        if (in_array('refinery', $technologyEffects['sceneUnlocks'] ?? [], true)) {
            $obstacles[] = ['x' => 3.2, 'z' => -1.9, 'radius' => .75];
        }

        return $obstacles;
    }

    private function blockedByObstacle(float $x, float $z, array $obstacles, float $extraClearance = 0): bool
    {
        foreach ($obstacles as $obstacle) {
            if (hypot($x - $obstacle['x'], $z - $obstacle['z']) < $obstacle['radius'] + $extraClearance) {
                return true;
            }
        }

        return false;
    }

    private function updateNavigationProgress(array &$robot, array $goal): bool
    {
        $distance = hypot($goal['x'] - $robot['x'], $goal['z'] - $robot['z']);
        $oldGoal = $robot['navigation_goal'];
        if (! is_array($oldGoal) || abs($oldGoal['x'] - $goal['x']) > .000001 || abs($oldGoal['z'] - $goal['z']) > .000001) {
            $robot['navigation_goal'] = $goal;
            $robot['best_distance'] = $distance;
            $robot['stalled_ticks'] = 0;

            return false;
        }
        if ($distance < (float) $robot['best_distance'] - .01) {
            $robot['best_distance'] = $distance;
            $robot['stalled_ticks'] = 0;

            return false;
        }

        $robot['stalled_ticks']++;

        return $robot['stalled_ticks'] >= 100;
    }
}
