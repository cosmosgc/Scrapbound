<?php

namespace App\Services;

class MissionResolver
{
    public function resolve(int $seed, int $sector, array $crew, array $rewards, array $rules, int $duration): array
    {
        $state = $seed ?: 1;
        $successRoll = $this->roll($state) % 10000 / 100;
        $successChance = max(
            (float) $rules['minimumSuccessPercent'],
            min((float) $rules['maximumSuccessPercent'],
                (float) $rules['baseSuccessPercent']
                + count($crew) * (float) $rules['successPerRobotPercent']
                - $sector * (float) $rules['riskPerSectorPercent']),
        );
        $success = $successRoll < $successChance;
        $credits = 0;
        $scrap = 0;
        if ($success) {
            $variation = (int) $rules['lootVariationPercent'];
            $lootPercent = 100 + ($variation ? ($this->roll($state) % ($variation * 2 + 1)) - $variation : 0);
            $crewCount = count($crew);
            $baseCredits = (int) $rewards['missionBaseCredits']
                + $sector * (int) $rewards['missionCreditsPerSector']
                + $crewCount * (int) $rewards['missionCreditsPerRobot'];
            $baseScrap = (int) $rewards['missionBaseScrap']
                + $sector * (int) $rewards['missionScrapPerSector']
                + $crewCount * (int) $rewards['missionScrapPerRobot'];
            $credits = max(1, (int) floor($baseCredits * $lootPercent / 100));
            $scrap = max(1, (int) floor($baseScrap * $lootPercent / 100));
        }

        return [
            'success' => $success,
            'success_chance_percent' => round($successChance, 2),
            'success_roll' => round($successRoll, 2),
            'sector' => $sector,
            'duration_seconds' => $duration,
            'crew_count' => count($crew),
            'crew' => array_map(fn (array $robot) => [
                'id' => $robot['id'], 'kind' => $robot['kind'], 'program_version' => $robot['program_version'],
            ], $crew),
            'rewards' => ['credits' => $credits, 'scrap' => $scrap],
            'events' => [
                ['at_second' => 0, 'type' => 'launch', 'label' => "Crew deployed to sector {$sector}"],
                ['at_second' => (int) floor($duration * 0.25), 'type' => 'scan', 'label' => 'Surveyed the salvage zone'],
                ['at_second' => (int) floor($duration * 0.55), 'type' => $success ? 'salvage' : 'setback', 'label' => $success ? 'Recovered mission cargo' : 'Encountered a field hazard'],
                ['at_second' => $duration, 'type' => $success ? 'return' : 'abort', 'label' => $success ? 'Crew returned to base' : 'Crew returned without a complete haul'],
            ],
            'seed' => $seed,
        ];
    }

    private function roll(int &$state): int
    {
        $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

        return $state;
    }
}
