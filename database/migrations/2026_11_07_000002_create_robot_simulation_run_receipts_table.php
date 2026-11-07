<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('robot_simulation_run_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('run_key', 40);
            $table->char('input_hash', 64);
            $table->json('result');
            $table->timestamps();
            $table->unique(['user_id', 'run_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('robot_simulation_run_receipts');
    }
};
