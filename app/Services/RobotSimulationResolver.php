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
    private const NAVIGATION_GRID_STEP = .5;

    public function resolve(array $crew, array $assignments, int $seed, int $ticks, array $upgrades = [], ?array $rewards = null, ?array $resources = null, array $technologyEffects = []): array
    {
        $rewards ??= config('scrapbound.rewards');
        $resources ??= config('scrapbound.resources', []);
        $nodes = $this->seedSites($seed, $resources, $technologyEffects);
        $drops = [];
        $programs = $assignments['units'] ?? [];
        $crewProgram = $assignments['crew'] ?? [];
        $robots = [];
        $id = 0;
        foreach (array_keys($crew) as $kind) {
            for ($owned = 0; $owned < ($crew[$kind] ?? 0) && $id < 20; $owned++, $id++) {
                $program = $programs[$id] ?? $crewProgram;
                $robots[] = [
                    'id' => $id, 'kind' => $kind, 'x' => ($id % 3 - 1) * .85,
                    'z' => 1.1 + floor($id / 3) * .8,
                    'program' => $program, 'command' => 0,
                    'phase' => 'idle', 'target' => null, 'destination' => null,
                    'target_drop' => null,
                    'cargo' => 0, 'cargo_type' => 'credits', 'work' => 0.0, 'wait' => 0.0,
                    'program_task' => null, 'assist_time' => 0.0,
                    'automation' => ! $program || $program === [['action' => 'patrol'], ['action' => 'scan'], ['action' => 'collect', 'resource' => 'credits']],
                    'navigation_goal' => null, 'best_distance' => null, 'stalled_ticks' => 0,
                    'navigation_path_goal' => null, 'navigation_path' => [], 'navigation_path_ready' => false, 'navigation_path_blocked' => false,
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
                $this->stepRobot($robot, $nodes, $drops, .1, $upgrades, $rewards, $resources, $technologyEffects, $robots, $payouts);
            }
            unset($robot);
        }

        return ['payouts' => $payouts, 'robots' => array_map(fn (array $robot) => [
            'id' => $robot['id'], 'kind' => $robot['kind'], 'x' => $robot['x'], 'z' => $robot['z'],
            'phase' => $robot['phase'], 'cargo' => $robot['cargo'], 'status' => $robot['status'] ?? 'Ready',
        ], $robots), 'nodes' => array_map(fn (array $node) => [
            'id' => $node['id'], 'resource' => $node['resource'], 'remaining' => $node['remaining'], 'stock' => $node['stock'],
            'x' => $node['x'], 'z' => $node['z'], 'respawnSeconds' => $node['respawn_duration'], 'respawnRemaining' => max(0, $node['respawn']),
        ], $nodes), 'drops' => array_values($drops)];
    }

    private function seedSites(int $seed, array $resources, array $technologyEffects): array
    {
        $state = $seed;
        $slots = [];
        for ($z = -9; $z <= 9; $z += 2) {
            for ($x = -15; $x <= 15; $x += 2) {
                // Solid voxel blocks fill the field; the central depot remains clear.
                if (abs($x) <= 5 && abs($z) <= 3) {
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
        foreach ($slots as $index => $slot) {
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
                'id' => "block-{$index}", 'x' => $slot['x'], 'z' => $slot['z'],
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

    private function stepRobot(array &$robot, array &$nodes, array &$drops, float $dt, array $upgrades, array $rewards, array $resources, array $technologyEffects, array &$robots, array &$payouts): void
    {
        if (! empty($robot['automation'])) {
            $this->stepAutomaticRobot($robot, $nodes, $drops, $dt, $upgrades, $rewards, $resources, $technologyEffects, $robots, $payouts);

            return;
        }
        if ($robot['phase'] === 'assist') {
            $this->stepAssist($robot, $dt, $upgrades, $technologyEffects, $nodes, $robots);

            return;
        }
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
                    $target = $this->findSite($robot, $nodes, $resource, $robots, $technologyEffects);
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
                case 'seek':
                    $target = $this->findSite($robot, $nodes, $step['resource'] ?? 'credits', $robots, $technologyEffects);
                    if ($target === null) { $robot['status'] = 'No matching salvage site'; return; }
                    $robot['target'] = $target; $robot['target_drop'] = null; $robot['program_task'] = 'seek';
                    $robot['phase'] = 'travel'; $robot['status'] = 'Seeking matching salvage site';
                    break;
                case 'mine':
                    $target = $this->findSite($robot, $nodes, $step['resource'] ?? 'credits', $robots, $technologyEffects);
                    if ($target === null) { $robot['status'] = 'No matching resource block'; return; }
                    $robot['target'] = $target; $robot['target_drop'] = null; $robot['program_task'] = 'mine';
                    $robot['phase'] = 'travel'; $robot['status'] = 'Driving to resource block';
                    break;
                case 'collect_drops':
                    $target = $this->findDrop($robot, $drops, $step['resource'] ?? 'scrap', $robots);
                    if ($target === null) { $robot['status'] = 'No matching salvage drops'; return; }
                    $robot['target'] = null; $robot['target_drop'] = $target; $robot['program_task'] = 'pickup';
                    $robot['phase'] = 'travel'; $robot['status'] = 'Driving to dropped resource';
                    break;
                case 'assist':
                    $robot['assist_time'] = (float) ($step['seconds'] ?? 10);
                    $robot['phase'] = 'assist'; $robot['status'] = 'Looking for a teammate to assist';
                    break;
                case 'wait':
                    $robot['wait'] = (float) $step['seconds'];
                    $robot['phase'] = 'wait';
                    $robot['status'] = 'Waiting';
                    break;
                case 'if_cargo':
                    $this->next($robot, $robot['cargo'] > 0 ? 1 : $step['skip'] + 1);

                    continue 2;
                case 'if_full':
                    $this->next($robot, $robot['cargo'] >= $this->capacity($robot) ? 1 : $step['skip'] + 1);

                    continue 2;
                case 'if_cargo_percent':
                    $this->next($robot, $robot['cargo'] / $this->capacity($robot) * 100 >= $step['percent'] ? 1 : $step['skip'] + 1);

                    continue 2;
                case 'if_robot_type':
                    $this->next($robot, $robot['kind'] === $step['kind'] ? 1 : $step['skip'] + 1);

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
                case 'if_drop':
                    $available = false;
                    foreach ($drops as $drop) {
                        if ($drop['resource'] === ($step['resource'] ?? 'scrap') && $drop['amount'] > 0) { $available = true; break; }
                    }
                    $this->next($robot, $available ? 1 : $step['skip'] + 1);

                    continue 2;
            }
        }

        if ($robot['phase'] === 'travel') {
            $destination = $robot['target_drop'] !== null
                ? ($drops[$robot['target_drop']] ?? null)
                : ($robot['target'] !== null ? ($nodes[$robot['target']] ?? null) : $robot['destination']);
            if ($destination === null || ($robot['target'] !== null && $destination['remaining'] <= 0)) {
                $task = $robot['program_task'];
                $robot['target'] = null; $robot['target_drop'] = null; $robot['program_task'] = null;
                $robot['phase'] = 'idle';
                if ($task !== null) $this->next($robot);

                return;
            }
            if ($robot['target_drop'] !== null) {
                $destination = $this->dropApproachPoint($robot, $destination, $nodes, $technologyEffects) ?? $destination;
            } elseif ($robot['target'] !== null) {
                $destination = $this->blockApproachPoint($robot, $nodes[$robot['target']], $nodes, $technologyEffects) ?? $destination;
            }
            if ($this->moveToward($robot, $destination, $dt, $upgrades, $robots, $technologyEffects, $nodes, $robot['target'] === null && $robot['target_drop'] === null)) {
                $robot['destination'] = null;
                if ($robot['program_task'] === 'mine') {
                    $robot['phase'] = 'mining'; $robot['work'] = 0; $robot['status'] = 'Breaking resource block';
                } elseif ($robot['program_task'] === 'pickup') {
                    $robot['phase'] = 'pickup'; $robot['status'] = 'Picking up dropped resource';
                } else {
                    $robot['phase'] = 'idle'; $robot['program_task'] = null; $this->next($robot);
                }
                $robot['navigation_goal'] = null;
                $robot['best_distance'] = null;
                $robot['stalled_ticks'] = 0;
                $this->resetNavigationPath($robot);
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
                    $this->resetNavigationPath($robot);
                } else {
                    $robot['status'] = 'Waiting for a clear route with cargo';
                }
            }
        } elseif ($robot['phase'] === 'mining') {
            $index = $robot['target'];
            if ($index === null || ! isset($nodes[$index]) || $nodes[$index]['remaining'] <= 0) {
                $robot['target'] = null; $robot['program_task'] = null; $robot['phase'] = 'idle'; $this->next($robot);

                return;
            }
            $supported = false;
            foreach ($robots as $other) if ($other['kind'] === 'buffer_bot' && hypot($other['x'] - $robot['x'], $other['z'] - $robot['z']) <= 2.5) $supported = true;
            $rate = match ($robot['kind']) { 'block_miner' => 2.4, 'scrap_hound' => 2.0, 'fabricator' => 1.2, 'sky_miner' => .85, default => .8 };
            $robot['work'] += $dt * $rate * ($supported ? 1.5 : 1) * (! empty($upgrades['servo']) ? 1.25 : 1);
            while ($robot['work'] >= 1 && $nodes[$index]['remaining'] > 0) { $robot['work']--; $nodes[$index]['remaining']--; }
            if ($nodes[$index]['remaining'] <= 0) {
                $amount = max(1, (int) ceil($nodes[$index]['stock'] / 3));
                $dropId = 'drop-'.$nodes[$index]['id'].'-'.count($drops);
                $drops[$dropId] = ['id' => $dropId, 'x' => $nodes[$index]['x'], 'z' => $nodes[$index]['z'], 'resource' => $nodes[$index]['resource'], 'amount' => $amount];
                $nodes[$index]['respawn'] = $nodes[$index]['respawn_duration'];
                $robot['target'] = null; $robot['program_task'] = null; $robot['phase'] = 'idle'; $robot['status'] = "Block broken · {$amount} {$nodes[$index]['resource']} dropped";
                $this->next($robot);
            }
        } elseif ($robot['phase'] === 'pickup') {
            $dropId = $robot['target_drop'];
            if ($dropId === null || ! isset($drops[$dropId]) || $drops[$dropId]['amount'] <= 0) {
                $robot['target_drop'] = null; $robot['program_task'] = null; $robot['phase'] = 'idle'; $this->next($robot);

                return;
            }
            $quantity = min($drops[$dropId]['amount'], $this->capacity($robot) - $robot['cargo']);
            $robot['cargo'] += $quantity; $robot['cargo_type'] = $drops[$dropId]['resource'];
            $drops[$dropId]['amount'] -= $quantity;
            if ($drops[$dropId]['amount'] <= 0) unset($drops[$dropId]);
            $robot['target_drop'] = null; $robot['program_task'] = null; $robot['phase'] = 'return'; $robot['status'] = 'Returning with mined resources';
        } elseif ($robot['phase'] === 'assist') {
            $this->stepAssist($robot, $dt, $upgrades, $technologyEffects, $nodes, $robots);
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
            $rate = match ($robot['kind']) {
                'scrap_hound' => 1.7, 'fabricator' => .72, 'sky_miner' => .42,
                'block_miner' => 2.0, 'cargo_hauler' => .8, default => 1.0,
            };
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
            if ($this->moveToward($robot, self::HOME, $dt, $upgrades, $robots, $technologyEffects, $nodes)) {
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
                $this->resetNavigationPath($robot);
            } elseif ($this->updateNavigationProgress($robot, self::HOME)) {
                $robot['status'] = 'Waiting for a clear depot approach';
                $this->resetNavigationPath($robot);
            }
        } elseif ($robot['phase'] === 'wait') {
            $robot['wait'] -= $dt;
            if ($robot['wait'] <= 0) {
                $robot['phase'] = 'idle';
                $this->next($robot);
            }
        }
    }

    private function stepAutomaticRobot(array &$robot, array &$nodes, array &$drops, float $dt, array $upgrades, array $rewards, array $resources, array $technologyEffects, array &$robots, array &$payouts): void
    {
        $kind = $robot['kind'];
        $isMiner = in_array($kind, ['scrap_hound', 'fabricator', 'block_miner', 'sky_miner'], true);
        $isGeneralist = $kind === 'scavenger';
        if ($kind === 'buffer_bot') {
            foreach ($robots as $other) {
                if ($other['id'] !== $robot['id'] && in_array($other['phase'], ['travel', 'mining'], true)
                    && in_array($other['kind'], ['scavenger', 'scrap_hound', 'fabricator', 'block_miner', 'sky_miner'], true)) {
                    $robot['x'] = $other['x'] - .9; $robot['z'] = $other['z'] - .9;
                    $robot['status'] = 'Boosting nearby bots'; $robot['phase'] = 'support';

                    return;
                }
            }
            $robot['phase'] = 'support'; $robot['status'] = 'Buffer ready at depot';

            return;
        }

        if ($robot['phase'] === 'return') {
            if ($this->moveToward($robot, self::HOME, $dt, $upgrades, $robots, $technologyEffects, $nodes)) {
                if ($robot['cargo'] > 0) {
                    $definition = collect($resources)->firstWhere('id', $robot['cargo_type']);
                    $currency = $definition['currency'] ?? $robot['cargo_type'];
                    $bonus = (float) ($technologyEffects['deliveryValueMultipliers'][$robot['cargo_type']] ?? 1);
                    $amount = (int) floor($robot['cargo'] * (int) ($definition['valuePerCargo'] ?? 0) * $bonus);
                    $payouts[] = ['robot_id' => $robot['id'], 'resource' => $currency, 'cargo_resource' => $robot['cargo_type'], 'cargo' => $robot['cargo'], 'amount' => $amount];
                }
                $robot['cargo'] = 0; $robot['target'] = null; $robot['target_drop'] = null;
                $robot['phase'] = 'idle'; $robot['status'] = 'Cargo delivered';
            }

            return;
        }

        if ($robot['phase'] === 'travel') {
            $destination = $robot['target_drop'] !== null
                ? ($drops[$robot['target_drop']] ?? null)
                : ($robot['target'] !== null ? ($nodes[$robot['target']] ?? null) : null);
            if (! $destination) { $robot['target'] = null; $robot['target_drop'] = null; $robot['phase'] = 'idle'; return; }
            $goal = $robot['target_drop'] !== null
                ? $this->dropApproachPoint($robot, $destination, $nodes, $technologyEffects)
                : $this->blockApproachPoint($robot, $destination, $nodes, $technologyEffects);
            if ($goal === null) { $robot['target'] = null; $robot['target_drop'] = null; $robot['phase'] = 'idle'; $robot['status'] = 'Target blocked; choosing another route'; return; }
            if ($this->moveToward($robot, $goal, $dt, $upgrades, $robots, $technologyEffects, $nodes, false)) {
                $robot['phase'] = $robot['target_drop'] !== null ? 'pickup' : 'mining';
                $robot['work'] = 0;
                $robot['status'] = $robot['phase'] === 'pickup' ? 'Picking up dropped resource' : 'Breaking resource block';
                $robot['navigation_goal'] = null; $robot['best_distance'] = null; $robot['stalled_ticks'] = 0;
                $this->resetNavigationPath($robot);
            } elseif ($this->updateNavigationProgress($robot, $goal)) {
                $robot['target'] = null; $robot['target_drop'] = null; $robot['phase'] = 'idle'; $robot['status'] = 'Route blocked; choosing another target';
                $robot['navigation_goal'] = null; $robot['best_distance'] = null; $robot['stalled_ticks'] = 0;
                $this->resetNavigationPath($robot);
            }

            return;
        }

        if ($robot['phase'] === 'mining') {
            $index = $robot['target'];
            if ($index === null || ! isset($nodes[$index]) || $nodes[$index]['remaining'] <= 0) { $robot['target'] = null; $robot['phase'] = 'idle'; return; }
            $supported = false;
            foreach ($robots as $other) if ($other['kind'] === 'buffer_bot' && hypot($other['x'] - $robot['x'], $other['z'] - $robot['z']) <= 2.5) $supported = true;
            $rate = $kind === 'sky_miner' ? .42 : ($kind === 'block_miner' ? 2.0 : ($kind === 'fabricator' ? 1.1 : ($kind === 'scrap_hound' ? 1.7 : 1.0)));
            $robot['work'] += $dt * $rate * ($supported ? 1.5 : 1);
            while ($robot['work'] >= 1 && $nodes[$index]['remaining'] > 0) { $robot['work']--; $nodes[$index]['remaining']--; }
            if ($nodes[$index]['remaining'] <= 0) {
                $amount = max(1, (int) ceil($nodes[$index]['stock'] / 3));
                $dropId = 'drop-'.$nodes[$index]['id'].'-'.count($drops);
                $drops[$dropId] = ['id' => $dropId, 'x' => $nodes[$index]['x'], 'z' => $nodes[$index]['z'], 'resource' => $nodes[$index]['resource'], 'amount' => $amount];
                $nodes[$index]['respawn'] = $nodes[$index]['respawn_duration'];
                $robot['target'] = null; $robot['phase'] = 'idle'; $robot['status'] = "Block broken · {$amount} {$nodes[$index]['resource']} dropped";
            }

            return;
        }

        if ($robot['phase'] === 'pickup') {
            $drop = $robot['target_drop'] !== null ? ($drops[$robot['target_drop']] ?? null) : null;
            if (! $drop || $drop['amount'] <= 0) { $robot['target_drop'] = null; $robot['phase'] = 'idle'; return; }
            $capacity = $kind === 'cargo_hauler' ? 8 : ($kind === 'fabricator' ? 6 : 4);
            $amount = min($drop['amount'], $capacity - $robot['cargo']);
            $robot['cargo'] += $amount; $robot['cargo_type'] = $drop['resource']; $drops[$robot['target_drop']]['amount'] -= $amount;
            if ($drops[$robot['target_drop']]['amount'] <= 0) unset($drops[$robot['target_drop']]);
            $robot['target_drop'] = null; $robot['phase'] = 'return'; $robot['status'] = 'Returning with mined resources';

            return;
        }

        $reservedBlocks = $reservedDrops = [];
        foreach ($robots as $other) if ($other['id'] !== $robot['id']) {
            if ($other['target'] !== null) $reservedBlocks[$other['target']] = true;
            if ($other['target_drop'] !== null) $reservedDrops[$other['target_drop']] = true;
        }
        $dropIds = array_keys(array_filter($drops, fn (array $drop, string $id): bool => $drop['amount'] > 0 && ! isset($reservedDrops[$id]), ARRAY_FILTER_USE_BOTH));
        usort($dropIds, fn (string $a, string $b): int => hypot($drops[$a]['x'] - $robot['x'], $drops[$a]['z'] - $robot['z']) <=> hypot($drops[$b]['x'] - $robot['x'], $drops[$b]['z'] - $robot['z']));
        if (! $isMiner && $dropIds) {
            $robot['target_drop'] = $dropIds[0]; $robot['phase'] = 'travel'; $robot['status'] = 'Driving to dropped resource';

            return;
        }
        if (! $isMiner && ! $isGeneralist) { $robot['status'] = 'Waiting for mined resources'; return; }
        $blockIds = [];
        foreach ($nodes as $index => $node) {
            if ($node['remaining'] > 0 && ! isset($reservedBlocks[$index]) && $this->blockApproachPoint($robot, $node, $nodes, $technologyEffects) !== null) $blockIds[] = $index;
        }
        usort($blockIds, fn (int $a, int $b): int => hypot($nodes[$a]['x'] - $robot['x'], $nodes[$a]['z'] - $robot['z']) <=> hypot($nodes[$b]['x'] - $robot['x'], $nodes[$b]['z'] - $robot['z']));
        if (! $blockIds) { $robot['status'] = 'Waiting for available block'; return; }
        $robot['target'] = $blockIds[0]; $robot['phase'] = 'travel'; $robot['status'] = 'Moving to resource block';
    }

    private function findSite(array $robot, array $nodes, string $resource, array $robots, array $technologyEffects): ?int
    {
        $assigned = [];
        foreach ($robots as $other) {
            if ($other['id'] !== $robot['id'] && $other['target'] !== null) {
                $assigned[$other['target']] = true;
            }
        }
        $ids = [];
        foreach ($nodes as $index => $node) {
            if ($node['resource'] === $resource && $node['remaining'] > 0 && ! isset($assigned[$index])
                && $this->blockApproachPoint($robot, $node, $nodes, $technologyEffects) !== null) {
                $ids[] = $index;
            }
        }
        usort($ids, fn (int $a, int $b) => hypot($nodes[$a]['x'] - $robot['x'], $nodes[$a]['z'] - $robot['z']) <=> hypot($nodes[$b]['x'] - $robot['x'], $nodes[$b]['z'] - $robot['z']));

        return $ids[0] ?? null;
    }

    private function findDrop(array $robot, array $drops, string $resource, array $robots): ?string
    {
        $reserved = [];
        foreach ($robots as $other) {
            if ($other['id'] !== $robot['id'] && $other['target_drop'] !== null) $reserved[$other['target_drop']] = true;
        }
        $ids = [];
        foreach ($drops as $id => $drop) {
            if ($drop['resource'] === $resource && $drop['amount'] > 0 && ! isset($reserved[$id])) $ids[] = $id;
        }
        usort($ids, fn (string $left, string $right): int =>
            hypot($drops[$left]['x'] - $robot['x'], $drops[$left]['z'] - $robot['z']) <=> hypot($drops[$right]['x'] - $robot['x'], $drops[$right]['z'] - $robot['z'])
        );

        return $ids[0] ?? null;
    }

    private function stepAssist(array &$robot, float $dt, array $upgrades, array $technologyEffects, array $nodes, array $robots): void
    {
        $robot['assist_time'] -= $dt;
        $teammates = array_values(array_filter($robots, static fn (array $other): bool =>
            $other['id'] !== $robot['id'] && in_array($other['phase'], ['travel', 'mining', 'collect', 'scan'], true)
        ));
        usort($teammates, static fn (array $left, array $right): int =>
            hypot($left['x'] - $robot['x'], $left['z'] - $robot['z']) <=> hypot($right['x'] - $robot['x'], $right['z'] - $robot['z'])
        );
        $teammate = $teammates[0] ?? null;
        if ($teammate) {
            $this->moveToward($robot, ['x' => $teammate['x'] - .9, 'z' => $teammate['z'] - .9], $dt, $upgrades, $robots, $technologyEffects, $nodes, false);
            $robot['status'] = 'Assisting unit '.str_pad((string) ($teammate['id'] + 1), 2, '0', STR_PAD_LEFT);
        } else {
            $robot['status'] = 'No active teammate · holding position';
        }
        if ($robot['assist_time'] <= 0) {
            $robot['assist_time'] = 0; $robot['phase'] = 'idle'; $robot['status'] = 'Support cycle complete'; $this->next($robot);
        }
    }

    private function capacity(array $robot): int
    {
        return $robot['kind'] === 'cargo_hauler' ? 8 : ($robot['kind'] === 'fabricator' ? 6 : 4);
    }

    private function next(array &$robot, int $amount = 1): void
    {
        $count = count($robot['program']);
        if ($count > 0) {
            $robot['command'] = ($robot['command'] + $amount) % $count;
        }
    }

    private function moveToward(array &$robot, array $destination, float $dt, array $upgrades, array $robots, array $technologyEffects, array $nodes = [], bool $useBerth = true): bool
    {
        $usesBerth = $useBerth && ($robot['target'] !== null || $robot['phase'] === 'return'
            || ($robot['phase'] === 'travel' && count($robots) > 1));
        if ($usesBerth) {
            if ($robot['id'] > 0) {
                $angle = $robot['id'] * 2.399963229728653;
                $destination = ['x' => $destination['x'] + cos($angle) * .8, 'z' => $destination['z'] + sin($angle) * .8];
            }
        }
        if ($robot['kind'] !== 'sky_miner') {
            $pathGoal = $robot['navigation_path_goal'];
            if (! is_array($pathGoal) || abs($pathGoal['x'] - $destination['x']) > .000001 || abs($pathGoal['z'] - $destination['z']) > .000001) {
                $path = $this->findGridPath($robot, $destination, $technologyEffects, $nodes);
                $robot['navigation_path_goal'] = $destination;
                $robot['navigation_path'] = $path ?? [];
                $robot['navigation_path_ready'] = true;
                $robot['navigation_path_blocked'] = $path === null;
            }
            if ($robot['navigation_path_blocked']) {
                return false;
            }
            while ($robot['navigation_path'] && hypot(
                $robot['navigation_path'][0]['x'] - $robot['x'],
                $robot['navigation_path'][0]['z'] - $robot['z'],
            ) <= .12) {
                array_shift($robot['navigation_path']);
            }
            if ($robot['navigation_path']) {
                if ($this->moveDirectToward($robot, $robot['navigation_path'][0], $dt, $upgrades, $robots, $technologyEffects, $nodes)) {
                    array_shift($robot['navigation_path']);
                }

                return false;
            }
        }

        return $this->moveDirectToward($robot, $destination, $dt, $upgrades, $robots, $technologyEffects, $nodes);
    }

    private function findGridPath(array $robot, array $destination, array $technologyEffects, array $nodes): ?array
    {
        $width = (int) round((16 - -16) / self::NAVIGATION_GRID_STEP) + 1;
        $height = (int) round((10 - -10) / self::NAVIGATION_GRID_STEP) + 1;
        $total = $width * $height;
        $toCell = static fn (float $x, float $z): array => [
            max(0, min($width - 1, (int) round(($x + 16) / self::NAVIGATION_GRID_STEP))),
            max(0, min($height - 1, (int) round(($z + 10) / self::NAVIGATION_GRID_STEP))),
        ];
        $indexOf = static fn (int $cellX, int $cellZ): int => $cellZ * $width + $cellX;
        $pointOf = static fn (int $index): array => [
            'x' => -16 + ($index % $width) * self::NAVIGATION_GRID_STEP,
            'z' => -10 + (int) floor($index / $width) * self::NAVIGATION_GRID_STEP,
        ];
        if (! $this->positionIsStaticallyClear($robot, $destination['x'], $destination['z'], $technologyEffects, $nodes)) return null;
        $movementObstacles = $robot['kind'] === 'sky_miner' ? [] : $this->obstaclesFor($technologyEffects);
        if ($robot['kind'] !== 'sky_miner') {
            foreach ($nodes as $node) if ($node['remaining'] > 0) $movementObstacles[] = ['x' => $node['x'], 'z' => $node['z'], 'radius' => .72];
        }
        $blocked = array_fill(0, $total, false);
        foreach ($movementObstacles as $obstacle) {
            $minX = max(0, (int) floor(($obstacle['x'] - $obstacle['radius'] + 16) / self::NAVIGATION_GRID_STEP));
            $maxX = min($width - 1, (int) ceil(($obstacle['x'] + $obstacle['radius'] + 16) / self::NAVIGATION_GRID_STEP));
            $minZ = max(0, (int) floor(($obstacle['z'] - $obstacle['radius'] + 10) / self::NAVIGATION_GRID_STEP));
            $maxZ = min($height - 1, (int) ceil(($obstacle['z'] + $obstacle['radius'] + 10) / self::NAVIGATION_GRID_STEP));
            for ($cellZ = $minZ; $cellZ <= $maxZ; $cellZ++) {
                for ($cellX = $minX; $cellX <= $maxX; $cellX++) {
                    $index = $indexOf($cellX, $cellZ);
                    $point = $pointOf($index);
                    if (hypot($point['x'] - $obstacle['x'], $point['z'] - $obstacle['z']) < $obstacle['radius'] + self::NAVIGATION_GRID_STEP * .5) $blocked[$index] = true;
                }
            }
        }
        [$startX, $startZ] = $toCell($robot['x'], $robot['z']);
        $start = null;
        for ($radius = 0; $radius <= 2 && $start === null; $radius++) {
            $candidates = [];
            for ($dz = -$radius; $dz <= $radius; $dz++) {
                for ($dx = -$radius; $dx <= $radius; $dx++) {
                    if (abs($dx) + abs($dz) !== $radius) continue;
                    $cellX = $startX + $dx;
                    $cellZ = $startZ + $dz;
                    if ($cellX < 0 || $cellX >= $width || $cellZ < 0 || $cellZ >= $height) continue;
                    $index = $indexOf($cellX, $cellZ);
                    $point = $pointOf($index);
                    if (! $blocked[$index]) $candidates[] = ['index' => $index, 'gap' => hypot($point['x'] - $robot['x'], $point['z'] - $robot['z'])];
                }
            }
            usort($candidates, static fn (array $left, array $right): int => ($left['gap'] <=> $right['gap']) ?: ($left['index'] <=> $right['index']));
            if ($candidates) $start = $candidates[0]['index'];
        }
        if ($start === null) return null;
        [$goalX, $goalZ] = $toCell($destination['x'], $destination['z']);
        $goals = [];
        for ($radius = 0; $radius <= 2; $radius++) {
            for ($dz = -$radius; $dz <= $radius; $dz++) {
                for ($dx = -$radius; $dx <= $radius; $dx++) {
                    if (abs($dx) + abs($dz) !== $radius) continue;
                    $cellX = $goalX + $dx;
                    $cellZ = $goalZ + $dz;
                    if ($cellX < 0 || $cellX >= $width || $cellZ < 0 || $cellZ >= $height) continue;
                    $index = $indexOf($cellX, $cellZ);
                    $point = $pointOf($index);
                    $gap = hypot($point['x'] - $destination['x'], $point['z'] - $destination['z']);
                    if ($gap <= .8 && ! $blocked[$index]) $goals[] = ['index' => $index, 'gap' => $gap];
                }
            }
            if ($goals) break;
        }
        usort($goals, static fn (array $left, array $right): int => ($left['gap'] <=> $right['gap']) ?: ($left['index'] <=> $right['index']));
        if (! $goals) return null;
        $goal = $goals[0]['index'];
        if ($goal === $start) return [];

        $parents = array_fill(0, $total, -2);
        $parents[$start] = -1;
        $queue = array_fill(0, $total, 0);
        $head = 0;
        $tail = 0;
        $queue[$tail++] = $start;
        $neighbors = [[1, 0], [0, 1], [0, -1], [-1, 0]];
        $found = false;
        while ($head < $tail && $tail <= $total) {
            $current = $queue[$head++];
            if ($current === $goal) { $found = true; break; }
            $cellX = $current % $width;
            $cellZ = (int) floor($current / $width);
            foreach ($neighbors as [$dx, $dz]) {
                $nextX = $cellX + $dx;
                $nextZ = $cellZ + $dz;
                if ($nextX < 0 || $nextX >= $width || $nextZ < 0 || $nextZ >= $height) continue;
                $next = $indexOf($nextX, $nextZ);
                if ($parents[$next] !== -2 || $blocked[$next]) continue;
                $parents[$next] = $current;
                $queue[$tail++] = $next;
            }
        }
        if (! $found) return null;
        $path = [];
        for ($current = $goal; $current !== $start; $current = $parents[$current]) $path[] = $pointOf($current);
        return array_reverse($path);
    }

    private function positionIsStaticallyClear(array $robot, float $x, float $z, array $technologyEffects, array $nodes): bool
    {
        if ($robot['kind'] === 'sky_miner') return true;
        if ($this->blockedByObstacle($x, $z, $this->obstaclesFor($technologyEffects))) return false;
        foreach ($nodes as $node) {
            if ($node['remaining'] > 0 && hypot($x - $node['x'], $z - $node['z']) < .72) return false;
        }
        return true;
    }

    private function moveDirectToward(array &$robot, array $destination, float $dt, array $upgrades, array $robots, array $technologyEffects, array $nodes): bool
    {
        $dx = $destination['x'] - $robot['x'];
        $dz = $destination['z'] - $robot['z'];
        $distance = hypot($dx, $dz);
        $baseSpeed = match ($robot['kind']) { 'sky_miner' => 3.2, 'scrap_hound' => 2.5, 'cargo_hauler' => 1.55, default => 1.8 };
        $speed = $baseSpeed * (! empty($upgrades['servo']) ? 1.25 : 1);
        if ($distance <= 0.000001) {
            return true;
        }

        $directCompletion = $distance <= $speed * $dt;
        $step = min($speed * $dt, $distance);
        $angle = atan2($dz, $dx);
        $side = $robot['id'] % 2 === 0 ? 1 : -1;
        $movementObstacles = $this->obstaclesFor($technologyEffects);
        if ($robot['kind'] !== 'sky_miner') {
            foreach ($nodes as $node) if ($node['remaining'] > 0) $movementObstacles[] = ['x' => $node['x'], 'z' => $node['z'], 'radius' => .72];
        }
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
            $clear = ! $this->blockedByObstacle($nextX, $nextZ, $movementObstacles);
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

    private function blockApproachPoint(array $robot, array $block, array $nodes, array $technologyEffects = []): ?array
    {
        $clearance = .96;
        $points = [
            ['x' => $block['x'] + $clearance, 'z' => $block['z']],
            ['x' => $block['x'] - $clearance, 'z' => $block['z']],
            ['x' => $block['x'], 'z' => $block['z'] + $clearance],
            ['x' => $block['x'], 'z' => $block['z'] - $clearance],
        ];
        $obstacles = $this->obstaclesFor($technologyEffects);
        foreach ($nodes as $node) {
            if ($node['remaining'] > 0) $obstacles[] = ['x' => $node['x'], 'z' => $node['z'], 'radius' => .72];
        }
        $planned = $robot['navigation_path_goal'] ?? null;
        if (is_array($planned)) {
            foreach ($points as $point) {
                if (abs($point['x'] - $planned['x']) < .000001 && abs($point['z'] - $planned['z']) < .000001
                    && abs($point['x']) <= 16 && abs($point['z']) <= 10
                    && ! $this->blockedByObstacle($point['x'], $point['z'], $obstacles)) {
                    return $point;
                }
            }
        }
        $points = array_values(array_filter($points, fn (array $point): bool =>
            abs($point['x']) <= 16 && abs($point['z']) <= 10
            && ! $this->blockedByObstacle($point['x'], $point['z'], $obstacles)
        ));
        usort($points, fn (array $left, array $right): int =>
            hypot($left['x'] - $robot['x'], $left['z'] - $robot['z']) <=> hypot($right['x'] - $robot['x'], $right['z'] - $robot['z'])
        );

        return $points[0] ?? null;
    }

    private function dropApproachPoint(array $robot, array $drop, array $nodes, array $technologyEffects = []): ?array
    {
        foreach ($nodes as $node) {
            if ($node['remaining'] > 0 && $node['x'] === $drop['x'] && $node['z'] === $drop['z']) {
                return $this->blockApproachPoint($robot, $node, $nodes, $technologyEffects);
            }
        }

        return ['x' => $drop['x'], 'z' => $drop['z']];
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

    private function resetNavigationPath(array &$robot): void
    {
        $robot['navigation_path_goal'] = null;
        $robot['navigation_path'] = [];
        $robot['navigation_path_ready'] = false;
        $robot['navigation_path_blocked'] = false;
    }
}
