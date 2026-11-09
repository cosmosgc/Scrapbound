<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('player_mission_runs', function (Blueprint $table): void {
            $table->foreignId('cooperative_job_id')->nullable()->after('user_id')->constrained('cooperative_jobs')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('player_mission_runs', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('cooperative_job_id');
        });
    }
};
