<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerIdleState extends Model
{
    protected $fillable = ['user_id', 'world_seed', 'last_settled_at'];

    protected function casts(): array
    {
        return ['world_seed' => 'integer', 'last_settled_at' => 'datetime'];
    }
}
