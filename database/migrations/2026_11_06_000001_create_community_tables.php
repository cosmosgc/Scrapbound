<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('kind', ['help', 'trade', 'collab']);
            $table->string('title', 90);
            $table->string('body', 600);
            $table->string('offering', 120)->default('');
            $table->string('seeking', 120)->default('');
            $table->enum('status', ['open', 'completed', 'matched'])->default('open');
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });

        Schema::create('community_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained('community_posts')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('message', 400);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['post_id', 'created_at']);
        });

        Schema::create('community_members', function (Blueprint $table) {
            $table->foreignId('community_post_id')->constrained('community_posts')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('joined_at')->useCurrent();
            $table->primary(['community_post_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_members');
        Schema::dropIfExists('community_replies');
        Schema::dropIfExists('community_posts');
    }
};
