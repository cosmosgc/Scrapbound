<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

#[Fillable(['username', 'password'])]
#[Hidden(['password'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    public function wallet(): HasOne
    {
        return $this->hasOne(Wallet::class);
    }

    public function robots(): HasMany
    {
        return $this->hasMany(PlayerRobot::class);
    }

    public function brainTemplates(): BelongsToMany
    {
        return $this->belongsToMany(BrainTemplate::class, 'user_brain_templates')->withPivot('unlocked_at');
    }

    public function blockedUsers(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'community_blocks', 'blocker_id', 'blocked_id')->withPivot('created_at');
    }

    public function blockedByUsers(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'community_blocks', 'blocked_id', 'blocker_id')->withPivot('created_at');
    }

    public function reports(): HasMany
    {
        return $this->hasMany(CommunityReport::class, 'reporter_id');
    }

    public function moderationActions(): HasMany
    {
        return $this->hasMany(CommunityModerationAudit::class, 'moderator_id');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }
}
