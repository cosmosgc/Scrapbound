<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_trades', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('recipient_id')->constrained('users')->cascadeOnDelete();
            $table->string('item_id', 40);
            $table->json('item_snapshot');
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('credit_price');
            $table->unsignedInteger('catalog_version');
            $table->string('create_key', 64);
            $table->char('input_hash', 64);
            $table->enum('status', ['open', 'accepted', 'declined', 'cancelled', 'expired'])->default('open');
            $table->timestamp('expires_at');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->unique(['seller_id', 'create_key']);
            $table->index(['recipient_id', 'status', 'expires_at']);
            $table->index(['seller_id', 'status', 'created_at']);
        });

        Schema::create('item_trade_audits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('trade_id')->nullable()->constrained('item_trades')->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('trade_ref');
            $table->string('event', 24);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['trade_ref', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_trade_audits');
        Schema::dropIfExists('item_trades');
    }
};
