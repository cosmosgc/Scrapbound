<?php

return [
    'items' => [
        ['id' => 'scavenger', 'name' => 'Scavenger bot', 'role' => 'General-purpose salvage runner', 'icon' => '⌕', 'cost' => 55, 'currency' => 'credits', 'tint' => '#a4d66d', 'priceGrowth' => 1.17],
        ['id' => 'scrap_hound', 'name' => 'Scrap hound', 'role' => 'Quick salvage specialist', 'icon' => '▧', 'cost' => 35, 'currency' => 'credits', 'tint' => '#e7a34f', 'priceGrowth' => 1.17],
        ['id' => 'fabricator', 'name' => 'Auto-fabricator', 'role' => 'Heavy-duty collection unit', 'icon' => '⚒', 'cost' => 110, 'currency' => 'scrap', 'tint' => '#78b7c9', 'priceGrowth' => 1.17],
    ],
    'upgrades' => [
        ['id' => 'servo', 'name' => 'Servo tuning', 'description' => 'Robot movement and collection speed +25%.', 'cost' => 120, 'currency' => 'credits', 'icon' => '↗'],
        ['id' => 'magnet', 'name' => 'Wideband magnet', 'description' => 'Delivered scrap haul +60%.', 'cost' => 80, 'currency' => 'scrap', 'icon' => '⌁'],
        ['id' => 'routing', 'name' => 'Smart routing', 'description' => 'Credits from expeditions +35%.', 'cost' => 200, 'currency' => 'credits', 'icon' => '⌘'],
    ],
    'rewards' => [
        'creditsPerCargo' => 5,
        'scrapPerCargo' => 2,
        'magnetScrapMultiplier' => 1.6,
        'missionBaseCredits' => 35,
        'missionCreditsPerSector' => 18,
        'missionCreditsPerRobot' => 12,
        'missionBaseScrap' => 10,
        'missionScrapPerSector' => 7,
        'missionScrapPerRobot' => 4,
    ],
    'missionRules' => [
        'baseDurationSeconds' => 20,
        'secondsPerSector' => 3,
        'maximumDurationSeconds' => 180,
        'maximumSector' => 100,
        'maximumStartsPerHour' => 6,
        'minimumCrew' => 1,
        'maximumCrew' => 20,
        'baseSuccessPercent' => 94,
        'successPerRobotPercent' => 2,
        'riskPerSectorPercent' => 1.5,
        'minimumSuccessPercent' => 35,
        'maximumSuccessPercent' => 99,
        'lootVariationPercent' => 10,
    ],
    'featureFlags' => ['serverWallet' => true, 'serverRobotRuns' => true, 'tradesEnabled' => false],
];
