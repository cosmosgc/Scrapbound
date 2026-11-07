<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommunityPost extends Model
{
    protected $fillable = ['user_id', 'kind', 'title', 'body', 'offering', 'seeking', 'status', 'is_hidden', 'hidden_by', 'hidden_at'];

    protected function casts(): array
    {
        return ['is_hidden' => 'boolean', 'hidden_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function replies(): HasMany
    {
        return $this->hasMany(CommunityReply::class, 'post_id');
    }

    public function members()
    {
        return $this->belongsToMany(User::class, 'community_members')->withPivot('joined_at');
    }
}
