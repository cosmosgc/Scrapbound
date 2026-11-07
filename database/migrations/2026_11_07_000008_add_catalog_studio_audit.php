<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_catalog_versions', function (Blueprint $table) {
            $table->foreignId('rollback_of')->nullable()->constrained('game_catalog_versions')->nullOnDelete();
        });

        Schema::create('game_catalog_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('version_id')->nullable()->constrained('game_catalog_versions')->nullOnDelete();
            $table->string('action', 30);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['version_id', 'created_at'], 'catalog_audit_version_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_catalog_audits');
        Schema::table('game_catalog_versions', function (Blueprint $table) {
            $table->dropForeign(['rollback_of']);
            $table->dropColumn('rollback_of');
        });
    }
};
