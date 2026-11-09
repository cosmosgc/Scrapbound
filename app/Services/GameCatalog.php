<?php

namespace App\Services;

use App\Models\GameCatalogVersion;
use DomainException;

class GameCatalog
{
    public function active(): array
    {
        $catalog = GameCatalogVersion::query()->where('status', 'published')->orderByDesc('version')->first();
        if (! $catalog) {
            return ['version' => 1, ...$this->validate(config('scrapbound'))];
        }

        return ['version' => $catalog->version, ...$this->validate($catalog->content)];
    }

    public function validate(array $content): array
    {
        if (array_diff(array_keys($content), ['items', 'upgrades', 'rewards', 'featureFlags', 'missionRules', 'inventoryItems', 'resources', 'technologyNodes'])) {
            throw new DomainException('Catalog has unsupported sections.');
        }
        foreach (['items', 'upgrades'] as $section) {
            if (! isset($content[$section]) || ! is_array($content[$section]) || ! array_is_list($content[$section]) || count($content[$section]) > 100) {
                throw new DomainException("Catalog {$section} must be a bounded list.");
            }
            $ids = [];
            foreach ($content[$section] as $entry) {
                if (! is_array($entry) || ! is_string($entry['id'] ?? null) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $entry['id']) || in_array($entry['id'], $ids, true)) {
                    throw new DomainException("Catalog {$section} contains an invalid or duplicate ID.");
                }
                $ids[] = $entry['id'];
                if (! is_int($entry['cost'] ?? null) || $entry['cost'] < 0 || $entry['cost'] > 1_000_000_000 || ! in_array($entry['currency'] ?? null, ['credits', 'scrap'], true)) {
                    throw new DomainException("Catalog {$section} contains an invalid cost.");
                }
                if (! is_string($entry['name'] ?? null) || strlen($entry['name']) > 80 || preg_match('/[<>]/', $entry['name'])) {
                    throw new DomainException("Catalog {$section} contains an invalid name.");
                }
                if ($section === 'items') {
                    foreach (['role', 'icon', 'tint'] as $field) {
                        if (! is_string($entry[$field] ?? null) || strlen($entry[$field]) > 100) {
                            throw new DomainException("Item {$field} is invalid.");
                        }
                    }
                    if (! preg_match('/^#[0-9a-fA-F]{6}$/', $entry['tint']) || ! is_numeric($entry['priceGrowth'] ?? null) || $entry['priceGrowth'] < 1 || $entry['priceGrowth'] > 5) {
                        throw new DomainException('Item tint or price growth is invalid.');
                    }
                    if (isset($entry['unlockNode']) && (! is_string($entry['unlockNode']) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $entry['unlockNode']))) {
                        throw new DomainException('Robot item unlock node is invalid.');
                    }
                } elseif (! is_string($entry['description'] ?? null) || strlen($entry['description']) > 200 || preg_match('/[<>]/', $entry['description'])) {
                    throw new DomainException('Upgrade description is invalid.');
                }
            }
        }
        if (! is_array($content['rewards'] ?? null) || ! is_array($content['featureFlags'] ?? null)) {
            throw new DomainException('Catalog rewards and feature flags are required.');
        }
        foreach ($content['rewards'] as $reward) {
            if (! is_numeric($reward) || ! is_finite((float) $reward) || $reward < 0 || $reward > 1_000_000) {
                throw new DomainException('Catalog reward values must be finite and bounded.');
            }
        }
        $rewards = $content['rewards'];
        if (! array_key_exists('missionAlloy', $rewards)) {
            $rewards['missionAlloy'] = (int) config('scrapbound.rewards.missionAlloy', 1);
        }
        $inventoryItems = $content['inventoryItems'] ?? config('scrapbound.inventoryItems', []);
        if (! is_array($inventoryItems) || ! array_is_list($inventoryItems) || count($inventoryItems) > 100) {
            throw new DomainException('Catalog inventoryItems must be a bounded list.');
        }
        $inventoryIds = [];
        foreach ($inventoryItems as $entry) {
            if (! is_array($entry) || ! is_string($entry['id'] ?? null) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $entry['id'])
                || in_array($entry['id'], $inventoryIds, true) || ! is_string($entry['name'] ?? null) || strlen($entry['name']) > 80
                || preg_match('/[<>]/', $entry['name']) || ! is_int($entry['maxStack'] ?? null) || $entry['maxStack'] < 1 || $entry['maxStack'] > 1000000
                || ! is_bool($entry['tradable'] ?? null)) {
                throw new DomainException('Catalog contains invalid or duplicate inventory item definitions.');
            }
            $inventoryIds[] = $entry['id'];
        }
        $resources = $content['resources'] ?? config('scrapbound.resources', []);
        if (! is_array($resources) || ! array_is_list($resources) || count($resources) < 2 || count($resources) > 100) {
            throw new DomainException('Catalog resources must be a bounded list.');
        }
        foreach ($resources as $index => $resource) {
            $defaultResource = is_array($resource)
                ? collect(config('scrapbound.resources', []))->firstWhere('id', $resource['id'] ?? null)
                : null;
            if (is_array($resource) && ! array_key_exists('respawnSeconds', $resource)) {
                $resources[$index]['respawnSeconds'] = $defaultResource['respawnSeconds'] ?? 60;
            } elseif (is_array($resource) && ($resource['respawnSeconds'] ?? null) == 5 && ($defaultResource['respawnSeconds'] ?? 5) >= 60) {
                // Upgrade previously published defaults as well as the config seed.
                $resources[$index]['respawnSeconds'] = $defaultResource['respawnSeconds'];
            }
            if (is_array($resource) && ! array_key_exists('zone', $resource)) {
                $defaultResource = collect(config('scrapbound.resources', []))->firstWhere('id', $resource['id'] ?? null);
                $resources[$index]['zone'] = $defaultResource['zone'] ?? 'frontier';
            }
        }
        $resourceIds = [];
        foreach ($resources as $resource) {
            if (! is_array($resource) || ! is_string($resource['id'] ?? null) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $resource['id'])
                || in_array($resource['id'], $resourceIds, true) || ! is_string($resource['name'] ?? null) || strlen($resource['name']) > 80
                || preg_match('/[<>]/', $resource['name']) || ! is_string($resource['icon'] ?? null) || strlen($resource['icon']) > 16
                || ! in_array($resource['currency'] ?? null, ['credits', 'scrap'], true)
                || ! is_int($resource['valuePerCargo'] ?? null) || $resource['valuePerCargo'] < 1 || $resource['valuePerCargo'] > 1000000
                || ! is_numeric($resource['spawnWeight'] ?? null) || ! is_finite((float) $resource['spawnWeight']) || $resource['spawnWeight'] < 0 || $resource['spawnWeight'] > 100
                || ! is_int($resource['minStock'] ?? null) || ! is_int($resource['maxStock'] ?? null) || $resource['minStock'] < 1 || $resource['maxStock'] < $resource['minStock'] || $resource['maxStock'] > 1000
                || ! is_numeric($resource['respawnSeconds'] ?? null) || ! is_finite((float) $resource['respawnSeconds']) || $resource['respawnSeconds'] < 1 || $resource['respawnSeconds'] > 3600) {
                throw new DomainException('Catalog contains an invalid or duplicate resource definition.');
            }
            if (! is_string($resource['zone'] ?? null) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $resource['zone'])) {
                throw new DomainException('Resource zone is invalid.');
            }
            if (isset($resource['unlockNode']) && (! is_string($resource['unlockNode']) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $resource['unlockNode']))) {
                throw new DomainException('Resource unlock node is invalid.');
            }
            $resourceIds[] = $resource['id'];
        }
        if (! in_array('credits', $resourceIds, true) || ! in_array('scrap', $resourceIds, true)) {
            throw new DomainException('Credits and scrap resource definitions are required.');
        }
        $technologyNodes = $content['technologyNodes'] ?? config('scrapbound.technologyNodes', []);
        if (! is_array($technologyNodes) || ! array_is_list($technologyNodes) || count($technologyNodes) > 200) {
            throw new DomainException('Technology nodes must be a bounded list.');
        }
        $nodeIds = [];
        $gridCells = [];
        foreach ($technologyNodes as $node) {
            if (! is_array($node) || ! is_string($node['id'] ?? null) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $node['id'])
                || in_array($node['id'], $nodeIds, true) || ! is_string($node['name'] ?? null) || strlen($node['name']) > 80
                || preg_match('/[<>]/', $node['name']) || ! is_string($node['description'] ?? null) || strlen($node['description']) > 240
                || preg_match('/[<>]/', $node['description']) || ! is_int($node['cost'] ?? null) || $node['cost'] < 0 || $node['cost'] > 1000000000
                || ! in_array($node['currency'] ?? null, ['credits', 'scrap'], true) || ! is_array($node['prerequisites'] ?? null)
                || ! array_is_list($node['prerequisites']) || ! is_array($node['effects'] ?? null)) {
                throw new DomainException('Catalog contains an invalid or duplicate technology node.');
            }
            if (array_diff(array_keys($node), ['id', 'name', 'description', 'cost', 'currency', 'prerequisites', 'effects', 'gridPosition'])) {
                throw new DomainException('Technology node contains unsupported fields.');
            }
            if (isset($node['gridPosition']) && (! is_array($node['gridPosition'])
                || ! is_int($node['gridPosition']['q'] ?? null) || ! is_int($node['gridPosition']['r'] ?? null)
                || abs($node['gridPosition']['q']) > 20 || abs($node['gridPosition']['r']) > 20
                || array_diff(array_keys($node['gridPosition']), ['q', 'r']))) {
                throw new DomainException('Technology node grid position must contain bounded axial q/r coordinates.');
            }
            if (isset($node['gridPosition'])) {
                $cell = $node['gridPosition']['q'].','.$node['gridPosition']['r'];
                if (isset($gridCells[$cell])) {
                    throw new DomainException('Technology nodes cannot share a honeycomb grid position.');
                }
                $gridCells[$cell] = true;
            }
            $effects = $node['effects'];
            if (array_diff(array_keys($effects), ['unlockResources', 'unlockZones', 'unlockCapabilities', 'unlockPrograms', 'unlockModules', 'unlockBotKinds', 'spawnWeightMultipliers', 'deliveryValueMultipliers', 'stockMultipliers', 'respawnTimeMultipliers', 'sceneUnlocks'])) {
                throw new DomainException('Technology node contains an unsupported effect.');
            }
            foreach (['unlockResources', 'unlockZones', 'unlockCapabilities', 'unlockPrograms', 'unlockModules', 'unlockBotKinds', 'sceneUnlocks'] as $listKey) {
                $values = $effects[$listKey] ?? [];
                if (! is_array($values) || ! array_is_list($values) || count($values) > 100) {
                    throw new DomainException("Technology effect {$listKey} must be a bounded list.");
                }
                foreach ($values as $value) {
                    if (! is_string($value) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $value)) {
                        throw new DomainException("Technology effect {$listKey} contains an invalid ID.");
                    }
                }
            }
            foreach (['spawnWeightMultipliers', 'deliveryValueMultipliers', 'stockMultipliers', 'respawnTimeMultipliers'] as $mapKey) {
                $values = $effects[$mapKey] ?? [];
                if (! is_array($values) || count($values) > 100) {
                    throw new DomainException("Technology effect {$mapKey} must be a bounded map.");
                }
                foreach ($values as $resourceId => $multiplier) {
                    if (! is_string($resourceId) || ! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $resourceId)
                        || ! is_numeric($multiplier) || ! is_finite((float) $multiplier) || $multiplier < ($mapKey === 'respawnTimeMultipliers' ? .1 : 0) || $multiplier > 5) {
                        throw new DomainException("Technology effect {$mapKey} contains an invalid multiplier.");
                    }
                }
            }
            $nodeIds[] = $node['id'];
        }
        foreach ($technologyNodes as $node) {
            foreach ($node['prerequisites'] as $prerequisite) {
                if (! is_string($prerequisite) || ! in_array($prerequisite, $nodeIds, true) || $prerequisite === $node['id']) {
                    throw new DomainException('Technology prerequisite is missing or invalid.');
                }
            }
            foreach ([...($node['effects']['unlockResources'] ?? []), ...array_keys($node['effects']['spawnWeightMultipliers'] ?? []), ...array_keys($node['effects']['deliveryValueMultipliers'] ?? []), ...array_keys($node['effects']['stockMultipliers'] ?? []), ...array_keys($node['effects']['respawnTimeMultipliers'] ?? [])] as $resourceId) {
                if (! in_array($resourceId, $resourceIds, true)) {
                    throw new DomainException('Technology effect references an unknown resource.');
                }
            }
            foreach ($node['effects']['unlockZones'] ?? [] as $zoneId) {
                if (! in_array($zoneId, array_column($resources, 'zone'), true)) {
                    throw new DomainException('Technology effect references an unknown zone.');
                }
            }
        }
        foreach ($content['items'] as $item) {
            if (isset($item['unlockNode']) && ! in_array($item['unlockNode'], $nodeIds, true)) {
                throw new DomainException('Robot item references an unknown technology node.');
            }
        }
        foreach ($resources as $resource) {
            if (isset($resource['unlockNode']) && ! in_array($resource['unlockNode'], $nodeIds, true)) {
                throw new DomainException('Resource references an unknown technology node.');
        }
        }
        $nodesById = collect($technologyNodes)->keyBy('id');
        $visiting = $visited = [];
        $visit = function (string $nodeId) use (&$visit, &$visiting, &$visited, $nodesById): void {
            if (isset($visiting[$nodeId])) {
                throw new DomainException('Technology prerequisites cannot contain cycles.');
            }
            if (isset($visited[$nodeId])) {
                return;
            }
            $visiting[$nodeId] = true;
            foreach ($nodesById[$nodeId]['prerequisites'] as $prerequisite) {
                $visit($prerequisite);
            }
            unset($visiting[$nodeId]);
            $visited[$nodeId] = true;
        };
        foreach ($nodeIds as $nodeId) {
            $visit($nodeId);
        }
        foreach ($content['featureFlags'] as $flag => $enabled) {
            if (! preg_match('/^[a-z][A-Za-z0-9]{1,39}$/', (string) $flag) || ! is_bool($enabled)) {
                throw new DomainException('Catalog feature flags must be named booleans.');
            }
        }
        $missionRules = $content['missionRules'] ?? config('scrapbound.missionRules');
        if (! is_array($missionRules)) {
            throw new DomainException('Mission rules must be an object.');
        }
        $integerRules = ['baseDurationSeconds', 'secondsPerSector', 'maximumDurationSeconds', 'maximumSector', 'maximumStartsPerHour', 'minimumCrew', 'maximumCrew'];
        $decimalRules = ['baseSuccessPercent', 'successPerRobotPercent', 'riskPerSectorPercent', 'minimumSuccessPercent', 'maximumSuccessPercent', 'lootVariationPercent'];
        if (array_diff(array_keys($missionRules), [...$integerRules, ...$decimalRules])) {
            throw new DomainException('Mission rules contain unsupported values.');
        }
        foreach ($integerRules as $rule) {
            if (! is_int($missionRules[$rule] ?? null) || $missionRules[$rule] < 1 || $missionRules[$rule] > 10000) {
                throw new DomainException("Mission rule {$rule} must be a bounded positive integer.");
            }
        }
        foreach ($decimalRules as $rule) {
            if (! is_numeric($missionRules[$rule] ?? null) || ! is_finite((float) $missionRules[$rule]) || $missionRules[$rule] < 0 || $missionRules[$rule] > 100) {
                throw new DomainException("Mission rule {$rule} must be a bounded percentage.");
            }
        }
        if ($missionRules['minimumCrew'] > $missionRules['maximumCrew'] || $missionRules['minimumSuccessPercent'] > $missionRules['maximumSuccessPercent'] || $missionRules['maximumDurationSeconds'] < $missionRules['baseDurationSeconds']) {
            throw new DomainException('Mission rule ranges are inconsistent.');
        }

        return [
            'items' => array_values($content['items']),
            'upgrades' => array_values($content['upgrades']),
            'rewards' => $rewards,
            'featureFlags' => $content['featureFlags'],
            'missionRules' => $missionRules,
            'inventoryItems' => array_values($inventoryItems),
            'resources' => array_values($resources),
            'technologyNodes' => array_values($technologyNodes),
        ];
    }
}
