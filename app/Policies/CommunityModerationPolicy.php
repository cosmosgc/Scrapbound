<?php

namespace App\Policies;

use App\Models\User;

class CommunityModerationPolicy
{
    public function viewQueue(User $user): bool
    {
        return $user->hasAnyRole(['moderator', 'admin']);
    }

    public function resolveReports(User $user): bool
    {
        return $user->hasAnyRole(['moderator', 'admin']);
    }

    public function manageSettings(User $user): bool
    {
        return $user->hasRole('admin');
    }
}
