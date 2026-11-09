<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_inventory', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('item_id', 40);
            $table->unsignedInteger('quantity')->default(0);
            $table->unsignedInteger('reserved_quantity')->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'item_id']);
        });

        Schema::create('player_inventory_receipts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('item_id', 40);
            $table->string('idempotency_key', 64);
            $table->enum('action', ['grant', 'spend', 'reserve', 'release']);
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('balance_after');
            $table->unsignedInteger('reserved_after');
            $table->string('reason', 80);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'item_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_inventory_receipts');
        Schema::dropIfExists('player_inventory');
    }
};
