<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerMissionRun extends Model
{
    protected $fillable = [
        'user_id', 'cooperative_job_id', 'run_key', 'input_hash', 'sector', 'seed', 'catalog_version', 'catalog_snapshot', 'duration_seconds', 'crew_snapshot',
        'status', 'started_at', 'completes_at', 'claimed_at', 'result',
    ];

    protected function casts(): array
    {
        return [
            'sector' => 'integer', 'seed' => 'integer', 'catalog_version' => 'integer', 'duration_seconds' => 'integer', 'cooperative_job_id' => 'integer',
            'catalog_snapshot' => 'array', 'crew_snapshot' => 'array', 'result' => 'array', 'started_at' => 'datetime',
            'completes_at' => 'datetime', 'claimed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
