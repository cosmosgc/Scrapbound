<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_pve_battles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('run_key', 40);
            $table->char('input_hash', 64);
            $table->unsignedBigInteger('seed');
            $table->unsignedInteger('catalog_version');
            $table->string('encounter_id', 40);
            $table->json('attacker_snapshot');
            $table->json('npc_snapshot');
            $table->json('result');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['user_id', 'run_key']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_pve_battles');
    }
};
