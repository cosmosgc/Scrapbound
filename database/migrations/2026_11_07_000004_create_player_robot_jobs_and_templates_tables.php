<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_robots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('unit_index');
            $table->string('kind', 32);
            $table->json('program')->nullable();
            $table->unsignedInteger('program_version')->default(1);
            $table->string('purchase_key', 64)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'unit_index']);
            $table->unique(['user_id', 'purchase_key']);
        });

        Schema::create('brain_templates', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 48);
            $table->unsignedInteger('version');
            $table->string('name', 80);
            $table->string('category', 40);
            $table->json('program');
            $table->json('compatible_kinds');
            $table->unsignedBigInteger('price')->default(0);
            $table->enum('currency', ['credits', 'scrap'])->default('credits');
            $table->enum('status', ['draft', 'published', 'retired'])->default('draft');
            $table->timestamps();
            $table->unique(['slug', 'version']);
            $table->index(['status', 'slug']);
        });

        Schema::create('user_brain_templates', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('brain_template_id')->constrained()->cascadeOnDelete();
            $table->timestamp('unlocked_at')->useCurrent();
            $table->primary(['user_id', 'brain_template_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_brain_templates');
        Schema::dropIfExists('brain_templates');
        Schema::dropIfExists('player_robots');
    }
};
