<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerRobot extends Model
{
    protected $fillable = ['user_id', 'unit_index', 'kind', 'program', 'program_version', 'purchase_key'];

    protected function casts(): array
    {
        return ['unit_index' => 'integer', 'program' => 'array', 'program_version' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
