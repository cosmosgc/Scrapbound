<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RobotSimulationRunReceipt extends Model
{
    protected $fillable = ['user_id', 'run_key', 'input_hash', 'result'];

    protected function casts(): array
    {
        return ['result' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
