<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerBattle extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'challenger_id', 'defender_id', 'run_key', 'input_hash', 'seed', 'catalog_version',
        'attacker_snapshot', 'defender_snapshot', 'result', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'seed' => 'integer', 'catalog_version' => 'integer', 'attacker_snapshot' => 'array',
            'defender_snapshot' => 'array', 'result' => 'array', 'created_at' => 'datetime',
        ];
    }
}
