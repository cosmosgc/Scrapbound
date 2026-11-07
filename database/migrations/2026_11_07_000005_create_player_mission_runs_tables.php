<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_mission_progress', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('unlocked_sector')->default(1);
            $table->timestamps();
        });

        Schema::create('player_mission_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('run_key', 40);
            $table->char('input_hash', 64);
            $table->unsignedInteger('sector');
            $table->unsignedBigInteger('seed');
            $table->unsignedInteger('duration_seconds');
            $table->json('crew_snapshot');
            $table->enum('status', ['active', 'claimed']);
            $table->timestamp('started_at');
            $table->timestamp('completes_at');
            $table->timestamp('claimed_at')->nullable();
            $table->json('result')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'run_key']);
            $table->index(['user_id', 'status', 'completes_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_mission_runs');
        Schema::dropIfExists('player_mission_progress');
    }
};
