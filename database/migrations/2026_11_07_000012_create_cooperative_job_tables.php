<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cooperative_jobs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('sector');
            $table->unsignedTinyInteger('goal');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->enum('status', ['open', 'completed', 'expired'])->default('open');
            $table->timestamp('expires_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'expires_at']);
        });

        Schema::create('cooperative_job_members', function (Blueprint $table): void {
            $table->foreignId('job_id')->constrained('cooperative_jobs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('contribution')->default(0);
            $table->timestamp('joined_at')->useCurrent();
            $table->primary(['job_id', 'user_id']);
        });

        Schema::create('cooperative_job_contributions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('job_id')->constrained('cooperative_jobs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('mission_run_id')->constrained('player_mission_runs')->cascadeOnDelete();
            $table->unsignedTinyInteger('amount')->default(1);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['job_id', 'user_id']);
            $table->unique('mission_run_id');
        });

        Schema::create('player_notifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 40);
            $table->json('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'read_at', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_notifications');
        Schema::dropIfExists('cooperative_job_contributions');
        Schema::dropIfExists('cooperative_job_members');
        Schema::dropIfExists('cooperative_jobs');
    }
};
