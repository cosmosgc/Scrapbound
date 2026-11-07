<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('community_posts', 'is_hidden')) {
            Schema::table('community_posts', function (Blueprint $table) {
                $table->boolean('is_hidden')->default(false);
                $table->foreignId('hidden_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('hidden_at')->nullable();
            });
        }

        if (! Schema::hasTable('community_reports')) {
            Schema::create('community_reports', function (Blueprint $table) {
                $table->id();
                $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('post_id')->constrained('community_posts')->cascadeOnDelete();
                $table->string('reason', 40);
                $table->string('details', 500)->default('');
                $table->string('status', 20)->default('pending');
                $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('resolution_note')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->timestamp('retain_until')->index();
                $table->timestamps();
                $table->unique(['reporter_id', 'post_id', 'status']);
                $table->index(['status', 'created_at']);
            });
        }

        if (! Schema::hasTable('community_blocks')) {
            Schema::create('community_blocks', function (Blueprint $table) {
                $table->foreignId('blocker_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('blocked_id')->constrained('users')->cascadeOnDelete();
                $table->timestamp('created_at')->useCurrent();
                $table->primary(['blocker_id', 'blocked_id']);
            });
        }

        if (! Schema::hasTable('community_moderation_audits')) {
            Schema::create('community_moderation_audits', function (Blueprint $table) {
                $table->id();
                $table->foreignId('moderator_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('action', 40);
                $table->string('target_type', 40);
                $table->unsignedBigInteger('target_id');
                $table->string('reason', 500)->default('');
                $table->json('metadata')->nullable();
                $table->timestamp('retain_until')->index();
                $table->timestamp('created_at')->useCurrent();
            });
        }
        if (! Schema::hasIndex('community_moderation_audits', 'cm_audit_target_created_idx')) {
            Schema::table('community_moderation_audits', function (Blueprint $table) {
                $table->index(['target_type', 'target_id', 'created_at'], 'cm_audit_target_created_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('community_moderation_audits');
        Schema::dropIfExists('community_blocks');
        Schema::dropIfExists('community_reports');
        Schema::table('community_posts', function (Blueprint $table) {
            $table->dropForeign(['hidden_by']);
            $table->dropColumn(['is_hidden', 'hidden_by', 'hidden_at']);
        });
    }
};
