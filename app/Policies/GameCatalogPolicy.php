<?php

namespace App\Policies;

use App\Models\User;

class GameCatalogPolicy
{
    public function manage(User $user): bool
    {
        return $user->hasRole('admin');
    }
}
