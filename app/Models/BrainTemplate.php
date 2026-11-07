<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class BrainTemplate extends Model
{
    protected $fillable = ['slug', 'version', 'name', 'category', 'program', 'compatible_kinds', 'price', 'currency', 'status'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'program' => 'array', 'compatible_kinds' => 'array', 'price' => 'integer'];
    }

    public function owners(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_brain_templates')->withPivot('unlocked_at');
    }
}
