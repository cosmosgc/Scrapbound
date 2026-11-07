<?php

return [
    'seasonKey' => env('SCRAPBOUND_SEASON_KEY', 'frontier-01'),
    'basePoints' => 100,
    'growth' => 1.16,
    'winPoints' => 25,
    'lossPoints' => 5,
    'milestones' => [
        ['rating' => 100, 'name' => 'Bronze pilot'],
        ['rating' => 250, 'name' => 'Silver pilot'],
        ['rating' => 500, 'name' => 'Gold pilot'],
        ['rating' => 1000, 'name' => 'Frontier ace'],
    ],
];
