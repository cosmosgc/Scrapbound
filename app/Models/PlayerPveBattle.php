<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerPveBattle extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'run_key', 'input_hash', 'seed', 'catalog_version', 'encounter_id', 'attacker_snapshot', 'npc_snapshot', 'result', 'created_at'];

    protected function casts(): array
    {
        return ['attacker_snapshot' => 'array', 'npc_snapshot' => 'array', 'result' => 'array', 'created_at' => 'datetime'];
    }
}
