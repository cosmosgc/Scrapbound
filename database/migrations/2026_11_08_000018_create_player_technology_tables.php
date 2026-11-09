<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_technology_unlocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('node_id', 40);
            $table->unsignedInteger('catalog_version');
            $table->json('effects');
            $table->timestamp('purchased_at');
            $table->timestamps();
            $table->unique(['user_id', 'node_id']);
        });

        Schema::create('player_technology_purchase_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('request_key', 40);
            $table->string('node_id', 40);
            $table->char('input_hash', 64);
            $table->json('result');
            $table->timestamps();
            $table->unique(['user_id', 'request_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_technology_purchase_receipts');
        Schema::dropIfExists('player_technology_unlocks');
    }
};
