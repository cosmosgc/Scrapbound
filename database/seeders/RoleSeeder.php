<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['player', 'moderator', 'admin'] as $name) {
            Role::findOrCreate($name, 'web');
        }
    }
}
