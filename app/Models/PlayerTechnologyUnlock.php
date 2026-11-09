<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerTechnologyUnlock extends Model
{
    protected $fillable = ['user_id', 'node_id', 'catalog_version', 'effects', 'purchased_at'];

    protected function casts(): array
    {
        return ['catalog_version' => 'integer', 'effects' => 'array', 'purchased_at' => 'datetime'];
    }
}
