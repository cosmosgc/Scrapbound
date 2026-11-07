<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_battle_defenses', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->json('robot_snapshot');
            $table->unsignedInteger('catalog_version');
            $table->timestamps();
        });

        Schema::create('player_battles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('challenger_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('defender_id')->constrained('users')->cascadeOnDelete();
            $table->string('run_key', 40);
            $table->char('input_hash', 64);
            $table->unsignedBigInteger('seed');
            $table->unsignedInteger('catalog_version');
            $table->json('attacker_snapshot');
            $table->json('defender_snapshot');
            $table->json('result');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['challenger_id', 'run_key']);
            $table->index(['defender_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_battles');
        Schema::dropIfExists('player_battle_defenses');
    }
};
