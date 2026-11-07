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
        if (array_diff(array_keys($content), ['items', 'upgrades', 'rewards', 'featureFlags', 'missionRules'])) {
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
            'rewards' => $content['rewards'],
            'featureFlags' => $content['featureFlags'],
            'missionRules' => $missionRules,
        ];
    }
}
