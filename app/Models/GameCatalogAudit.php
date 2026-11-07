<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameCatalogAudit extends Model
{
    public $timestamps = false;

    protected $fillable = ['actor_id', 'version_id', 'action', 'metadata', 'created_at'];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'created_at' => 'datetime'];
    }
}
