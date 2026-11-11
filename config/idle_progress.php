<?php

return [
    'max_offline_seconds' => (int) env('SCRAPBOUND_MAX_OFFLINE_SECONDS', 14400),
    'hard_max_offline_seconds' => 28800,
    'ticks_per_second' => 10,
    'max_ticks' => 288000,
    'max_reward_per_currency' => 250000,
];
