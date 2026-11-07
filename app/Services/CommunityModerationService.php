<?php

namespace App\Services;

use App\Models\CommunityModerationAudit;
use App\Models\CommunityPost;
use App\Models\CommunityReport;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class CommunityModerationService
{
    public function reportPost(User $reporter, int $postId, string $reason, string $details = ''): CommunityReport
    {
        $post = CommunityPost::query()->findOrFail($postId);
        if ((int) $post->user_id === (int) $reporter->id) {
            throw new DomainException('You cannot report your own post.');
        }
        if (CommunityReport::query()->where('reporter_id', $reporter->id)->where('post_id', $postId)->where('status', 'pending')->exists()) {
            throw new DomainException('You already have a pending report for this post.');
        }

        return CommunityReport::create([
            'reporter_id' => $reporter->id,
            'post_id' => $postId,
            'reason' => $reason,
            'details' => $details,
            'status' => 'pending',
            'retain_until' => now()->addDays(180),
        ]);
    }

    public function block(User $blocker, int $blockedId): bool
    {
        if ((int) $blocker->id === $blockedId) {
            throw new DomainException('You cannot block your own account.');
        }
        if (! User::query()->whereKey($blockedId)->exists()) {
            throw new DomainException('That player does not exist.');
        }

        return DB::table('community_blocks')->insertOrIgnore([
            'blocker_id' => $blocker->id, 'blocked_id' => $blockedId, 'created_at' => now(),
        ]) > 0;
    }

    public function unblock(User $blocker, int $blockedId): bool
    {
        return DB::table('community_blocks')->where('blocker_id', $blocker->id)->where('blocked_id', $blockedId)->delete() > 0;
    }

    public function queue(int $limit = 50): array
    {
        return CommunityReport::query()->with(['reporter:id,username', 'post:id,user_id,kind,title,body,is_hidden', 'post.user:id,username'])
            ->where('status', 'pending')->oldest()->limit($limit)->get()
            ->map(fn (CommunityReport $report) => [
                'id' => $report->id,
                'reporter' => ['id' => $report->reporter_id, 'username' => $report->reporter->username],
                'reason' => $report->reason,
                'details' => $report->details,
                'created_at' => $report->created_at?->toIso8601String(),
                'post' => [
                    'id' => $report->post->id,
                    'player_id' => $report->post->user_id,
                    'username' => $report->post->user->username,
                    'kind' => $report->post->kind,
                    'title' => $report->post->title,
                    'body' => $report->post->body,
                    'hidden' => $report->post->is_hidden,
                ],
            ])->all();
    }

    public function resolve(User $moderator, int $reportId, string $decision, string $note = ''): array
    {
        return DB::transaction(function () use ($moderator, $reportId, $decision, $note): array {
            $report = CommunityReport::query()->with('post')->lockForUpdate()->findOrFail($reportId);
            if ($report->status !== 'pending') {
                throw new DomainException('This report has already been resolved.');
            }
            if ($decision === 'hide_post') {
                $report->post->forceFill(['is_hidden' => true, 'hidden_by' => $moderator->id, 'hidden_at' => now()])->save();
            } elseif ($decision === 'restore_post') {
                $report->post->forceFill(['is_hidden' => false, 'hidden_by' => null, 'hidden_at' => null])->save();
            }
            $report->forceFill([
                'status' => $decision === 'dismiss' ? 'dismissed' : 'resolved',
                'resolved_by' => $moderator->id,
                'resolution_note' => $note,
                'resolved_at' => now(),
            ])->save();
            CommunityModerationAudit::create([
                'moderator_id' => $moderator->id,
                'action' => $decision,
                'target_type' => 'community_post',
                'target_id' => $report->post_id,
                'reason' => $note,
                'metadata' => ['report_id' => $report->id, 'report_reason' => $report->reason],
                'retain_until' => now()->addDays(365),
                'created_at' => now(),
            ]);

            return ['report_id' => $report->id, 'status' => $report->status, 'post_hidden' => (bool) $report->post->fresh()->is_hidden];
        });
    }
}
