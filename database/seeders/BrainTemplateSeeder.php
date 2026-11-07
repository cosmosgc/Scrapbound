<?php

namespace Database\Seeders;

use App\Models\BrainTemplate;
use App\Services\RobotProgramValidator;
use Illuminate\Database\Seeder;

class BrainTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $program = [
            ['action' => 'patrol'],
            ['action' => 'scan'],
            ['action' => 'collect', 'resource' => 'credits'],
        ];
        app(RobotProgramValidator::class)->validateProgram($program);
        BrainTemplate::firstOrCreate(
            ['slug' => 'salvage-scout', 'version' => 1],
            [
                'name' => 'Salvage scout', 'category' => 'salvage', 'program' => $program,
                'compatible_kinds' => ['scavenger', 'scrap_hound', 'fabricator'],
                'price' => 0, 'currency' => 'credits', 'status' => 'published',
            ],
        );
        BrainTemplate::firstOrCreate(
            ['slug' => 'scrap-runner', 'version' => 1],
            [
                'name' => 'Scrap runner', 'category' => 'salvage',
                'program' => [
                    ['action' => 'patrol'],
                    ['action' => 'scan'],
                    ['action' => 'collect', 'resource' => 'scrap'],
                    ['action' => 'return_home'],
                ],
                'compatible_kinds' => ['scavenger', 'scrap_hound'],
                'price' => 25, 'currency' => 'scrap', 'status' => 'published',
            ],
        );
    }
}
