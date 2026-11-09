<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerTechnologyPurchaseReceipt extends Model
{
    protected $fillable = ['user_id', 'request_key', 'node_id', 'input_hash', 'result'];

    protected function casts(): array
    {
        return ['result' => 'array'];
    }
}
