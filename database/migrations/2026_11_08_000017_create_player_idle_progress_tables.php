<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_idle_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('world_seed');
            $table->timestamp('last_settled_at');
            $table->timestamps();
        });

        Schema::create('player_idle_settlement_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('request_key', 40);
            $table->char('input_hash', 64);
            $table->json('result');
            $table->timestamps();
            $table->unique(['user_id', 'request_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_idle_settlement_receipts');
        Schema::dropIfExists('player_idle_states');
    }
};
