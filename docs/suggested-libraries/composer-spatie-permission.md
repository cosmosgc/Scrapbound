# Spatie Laravel Permission (Composer)

**Status:** Installed and used for account roles; privileged features remain future work.

`spatie/laravel-permission` provides persisted roles and permissions that integrate with Laravel's authorization system. It may fit moderator/admin capabilities for community reports and the future content studio.

`User` uses `HasRoles`; new signups receive `player`; `RoleSeeder` creates `player`, `moderator`, and `admin`. Define policy boundaries and add authorization tests before exposing privileged routes.

```sh
php artisan db:seed --class=RoleSeeder
```

Its migration/config are committed in `database/migrations` and `config/permission.php`. Always enforce authorization in Laravel; hiding admin controls in the client is not protection. Use policies for ownership checks even when roles exist.
