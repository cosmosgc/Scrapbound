<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunityModerationAudit extends Model
{
    public $timestamps = false;

    protected $fillable = ['moderator_id', 'action', 'target_type', 'target_id', 'reason', 'metadata', 'retain_until', 'created_at'];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'retain_until' => 'datetime', 'created_at' => 'datetime'];
    }
}
