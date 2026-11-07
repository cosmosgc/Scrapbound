<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameCatalogVersion extends Model
{
    protected $fillable = ['version', 'status', 'content', 'created_by', 'published_at', 'rollback_of'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'rollback_of' => 'integer', 'content' => 'array', 'published_at' => 'datetime'];
    }
}
