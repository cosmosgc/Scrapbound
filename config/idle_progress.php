<?php

return [
    'max_offline_seconds' => (int) env('SCRAPBOUND_MAX_OFFLINE_SECONDS', 14400),
    'ticks_per_second' => 10,
    'max_ticks' => 144000,
    'max_reward_per_currency' => 250000,
];
