<?php

namespace App\Console\Commands;

use App\Models\CommunityModerationAudit;
use App\Models\CommunityReport;
use Illuminate\Console\Command;

class PruneCommunityModerationData extends Command
{
    protected $signature = 'community:prune-moderation-data';

    protected $description = 'Delete community reports and moderation audit records past their retention dates';

    public function handle(): int
    {
        $reports = CommunityReport::query()->where('retain_until', '<=', now())->delete();
        $audits = CommunityModerationAudit::query()->where('retain_until', '<=', now())->delete();
        $this->info("Pruned {$reports} expired reports and {$audits} expired moderation audit records.");

        return self::SUCCESS;
    }
}
