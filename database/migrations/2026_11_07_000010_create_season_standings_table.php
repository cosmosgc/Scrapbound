<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('season_standings', function (Blueprint $table): void {
            $table->id();
            $table->string('season_key', 40);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('rating')->default(0);
            $table->unsignedInteger('wins')->default(0);
            $table->unsignedInteger('losses')->default(0);
            $table->timestamps();
            $table->unique(['season_key', 'user_id']);
            $table->index(['season_key', 'rating']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('season_standings');
    }
};
