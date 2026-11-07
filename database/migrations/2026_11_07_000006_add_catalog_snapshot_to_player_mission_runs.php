<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('player_mission_runs', function (Blueprint $table) {
            $table->unsignedInteger('catalog_version')->default(1)->after('seed');
            $table->json('catalog_snapshot')->nullable()->after('crew_snapshot');
        });
    }

    public function down(): void
    {
        Schema::table('player_mission_runs', function (Blueprint $table) {
            $table->dropColumn(['catalog_version', 'catalog_snapshot']);
        });
    }
};
