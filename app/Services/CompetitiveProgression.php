<?php

namespace App\Services;

use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class CompetitiveProgression
{
    public function config(): array
    {
        $rules = config('progression');
        if (! is_array($rules) || ! is_string($rules['seasonKey'] ?? null) || ! preg_match('/^[a-zA-Z0-9_-]{1,40}$/', $rules['seasonKey'])) {
            throw new DomainException('Competitive progression configuration is invalid.');
        }
        foreach (['basePoints', 'growth', 'winPoints', 'lossPoints'] as $key) {
            if (! is_numeric($rules[$key] ?? null) || ! is_finite((float) $rules[$key]) || $rules[$key] < 0 || $rules[$key] > 100000) {
                throw new DomainException("Progression {$key} must be finite and bounded.");
            }
        }
        if ($rules['growth'] < 1 || ! is_array($rules['milestones'] ?? null) || count($rules['milestones']) > 50) {
            throw new DomainException('Progression milestones or growth are invalid.');
        }
        $previous = 0;
        foreach ($rules['milestones'] as $milestone) {
            if (! is_array($milestone) || ! is_int($milestone['rating'] ?? null) || $milestone['rating'] <= $previous || $milestone['rating'] > 100000000 || ! is_string($milestone['name'] ?? null) || strlen($milestone['name']) > 40) {
                throw new DomainException('Progression milestones must have ordered bounded ratings and names.');
            }
            $previous = $milestone['rating'];
        }

        return $rules;
    }

    public function tier(int $rating, array $rules): array
    {
        $tier = 1;
        $threshold = (int) $rules['basePoints'];
        while ($rating >= $threshold && $tier < 1000) {
            $tier++;
            $threshold = min(100000000, (int) ceil($threshold * (float) $rules['growth']));
        }
        return ['tier' => $tier, 'next_rating' => $threshold];
    }

    public function recordBattle(int $challengerId, int $defenderId, int $winnerId): void
    {
        $rules = $this->config();
        $season = $rules['seasonKey'];
        foreach ([$challengerId, $defenderId] as $userId) {
            $row = DB::table('season_standings')->where('season_key', $season)->where('user_id', $userId)->lockForUpdate()->first();
            $won = $userId === $winnerId;
            $points = (int) ($won ? $rules['winPoints'] : $rules['lossPoints']);
            DB::table('season_standings')->updateOrInsert(
                ['season_key' => $season, 'user_id' => $userId],
                ['rating' => min(100000000, (int) ($row->rating ?? 0) + $points),
                 'wins' => (int) ($row->wins ?? 0) + ($won ? 1 : 0),
                 'losses' => (int) ($row->losses ?? 0) + ($won ? 0 : 1),
                 'updated_at' => now(), 'created_at' => $row->created_at ?? now()],
            );
        }
    }

    public function playerSummary(User $user): array
    {
        $rules = $this->config();
        $row = DB::table('season_standings')->where('season_key', $rules['seasonKey'])->where('user_id', $user->id)->first();
        $rating = (int) ($row->rating ?? 0);
        $tier = $this->tier($rating, $rules);
        $milestones = array_values(array_filter($rules['milestones'], fn (array $milestone): bool => $rating >= $milestone['rating']));
        return ['season' => $rules['seasonKey'], 'rating' => $rating, ...$tier, 'wins' => (int) ($row->wins ?? 0), 'losses' => (int) ($row->losses ?? 0), 'milestones' => $milestones];
    }

    public function overview(User $user): array
    {
        $rules = $this->config();
        $standings = DB::table('season_standings')->join('users', 'users.id', '=', 'season_standings.user_id')
            ->where('season_key', $rules['seasonKey'])->orderByDesc('rating')->orderBy('users.username')->limit(50)
            ->get(['users.username', 'season_standings.rating', 'season_standings.wins', 'season_standings.losses']);
        return ['ok' => true, 'progression' => $this->playerSummary($user), 'standings' => $standings];
    }
}
