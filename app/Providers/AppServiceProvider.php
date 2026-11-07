<?php

namespace App\Providers;

use App\Policies\CommunityModerationPolicy;
use App\Policies\GameCatalogPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::define('view-moderation-queue', [CommunityModerationPolicy::class, 'viewQueue']);
        Gate::define('resolve-moderation-reports', [CommunityModerationPolicy::class, 'resolveReports']);
        Gate::define('manage-community-settings', [CommunityModerationPolicy::class, 'manageSettings']);
        Gate::define('manage-game-catalog', [GameCatalogPolicy::class, 'manage']);
    }
}
