<?php

namespace Database\Seeders;

use App\Models\GameCatalogVersion;
use App\Services\GameCatalog;
use Illuminate\Database\Seeder;

class GameCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $content = app(GameCatalog::class)->validate(config('scrapbound'));
        GameCatalogVersion::firstOrCreate(
            ['version' => 1],
            ['status' => 'published', 'content' => $content, 'published_at' => now()],
        );
    }
}
