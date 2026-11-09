<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerIdleSettlementReceipt extends Model
{
    protected $fillable = ['user_id', 'request_key', 'input_hash', 'result'];

    protected function casts(): array
    {
        return ['result' => 'array'];
    }
}
