<?php

namespace App\Services;

use App\Models\BrainTemplate;
use App\Models\PlayerRobot;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class PlayerJobService
{
    public function __construct(private readonly RobotProgramValidator $programs, private readonly CurrencyLedger $ledger) {}

    public function ensurePlayer(User $user): void
    {
        DB::transaction(function () use ($user): void {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            if (! $user->robots()->exists()) {
                $starter = BrainTemplate::query()->where('slug', 'salvage-scout')->where('status', 'published')->orderByDesc('version')->first();
                $user->robots()->create([
                    'unit_index' => 0, 'kind' => 'scavenger',
                    'program' => $starter?->program ?? [
                        ['action' => 'patrol'], ['action' => 'scan'], ['action' => 'collect', 'resource' => 'credits'],
                    ], 'program_version' => $starter?->version ?? 1,
                ]);
            }
            $starter = BrainTemplate::query()->where('slug', 'salvage-scout')->where('status', 'published')->orderByDesc('version')->first();
            if ($starter && ! $user->brainTemplates()->whereKey($starter->id)->exists()) {
                $user->brainTemplates()->attach($starter->id);
            }
        });
    }

    public function jobs(User $user): array
    {
        $this->ensurePlayer($user);
        $robots = $user->robots()->orderBy('unit_index')->get()->map(fn (PlayerRobot $robot) => [
            'id' => $robot->unit_index, 'kind' => $robot->kind,
            'program' => $this->programs->validateProgram($robot->program ?? []), 'program_version' => $robot->program_version,
        ])->values();
        $unlockedIds = $user->brainTemplates()->pluck('brain_templates.id')->all();
        $templates = BrainTemplate::query()->where('status', 'published')->orderBy('slug')->orderByDesc('version')->get()
            ->unique('slug')->values()->map(fn (BrainTemplate $template) => [...$this->templateData($template), 'unlocked' => in_array((int) $template->id, array_map('intval', $unlockedIds), true)]);
        $wallet = $this->ledger->walletFor($user);

        return [
            'robots' => $robots,
            'templates' => $templates,
            'wallet' => ['credits' => $wallet->credits, 'scrap' => $wallet->scrap],
        ];
    }

    public function assignProgram(User $user, string|int $target, array $program): array
    {
        $program = $this->programs->validateProgram($program);
        $this->ensurePlayer($user);

        return DB::transaction(function () use ($user, $target, $program): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $robots = $user->robots()->orderBy('unit_index')->lockForUpdate()->get();
            $targets = $target === 'all' ? $robots : $robots->where('unit_index', (int) $target);
            if ($targets->isEmpty()) {
                throw new DomainException('Target robot is not owned.');
            }
            foreach ($targets as $robot) {
                $robot->forceFill(['program' => $program, 'program_version' => $robot->program_version + 1])->save();
            }

            return $this->jobs($user);
        });
    }

    public function purchaseRobot(User $user, string $kind, string $idempotencyKey): array
    {
        $this->ensurePlayer($user);

        return DB::transaction(function () use ($user, $kind, $idempotencyKey): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $existing = $user->robots()->where('purchase_key', $idempotencyKey)->first();
            if ($existing) {
                if ($existing->kind !== $kind) {
                    throw new DomainException('Purchase key was already used for a different robot.');
                }

                return $this->jobs($user);
            }
            $robots = $user->robots()->orderBy('unit_index')->lockForUpdate()->get();
            if ($robots->count() >= 20) {
                throw new DomainException('Robot crew is full.');
            }
            $item = collect(app(GameCatalog::class)->active()['items'])->firstWhere('id', $kind);
            if (! $item) {
                throw new DomainException('Robot type is not in the active catalog.');
            }
            if (isset($item['unlockNode']) && ! in_array($kind, app(TechnologyTreeService::class)->effectsFor($user)['unlockBotKinds'], true)) {
                throw new DomainException('Research the required technology before purchasing this robot.');
            }
            $owned = $robots->where('kind', $kind)->count();
            $cost = (int) ceil($item['cost'] * (($item['priceGrowth'] ?? 1.17) ** $owned));
            $this->ledger->spend($user, $item['currency'], $cost, $idempotencyKey, 'robot_purchase', ['kind' => $kind]);
            $unitIndex = (int) $robots->max('unit_index') + 1;
            $user->robots()->create([
                'unit_index' => $unitIndex, 'kind' => $kind,
                'program' => $user->robots()->where('kind', 'scavenger')->orderBy('unit_index')->value('program') ?? [],
                'program_version' => 1, 'purchase_key' => $idempotencyKey,
            ]);

            return $this->jobs($user);
        });
    }

    public function unlockTemplate(User $user, int $templateId, string $idempotencyKey): array
    {
        $this->ensurePlayer($user);

        return DB::transaction(function () use ($user, $templateId, $idempotencyKey): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $template = BrainTemplate::query()->whereKey($templateId)->where('status', 'published')->firstOrFail();
            if (! $user->brainTemplates()->whereKey($template->id)->exists()) {
                if ($template->price > 0) {
                    $this->ledger->spend($user, $template->currency, $template->price, $idempotencyKey, 'template_unlock', ['template_id' => $template->id]);
                }
                $user->brainTemplates()->attach($template->id);
            }

            return $this->jobs($user);
        });
    }

    public function deployTemplate(User $user, int $templateId, string|int $target): array
    {
        $template = $user->brainTemplates()->where('brain_templates.id', $templateId)->where('status', 'published')->first();
        if (! $template) {
            throw new DomainException('Template is not unlocked.');
        }
        $robots = $user->robots()->orderBy('unit_index')->get();
        $targets = $target === 'all' ? $robots : $robots->where('unit_index', (int) $target);
        if ($targets->isEmpty()) {
            throw new DomainException('Target robot is not owned.');
        }
        foreach ($targets as $robot) {
            if (! in_array($robot->kind, $template->compatible_kinds, true)) {
                throw new DomainException("Template is not compatible with {$robot->kind}.");
            }
        }

        return $this->assignProgram($user, $target, $this->programs->validateProgram($template->program));
    }

    private function templateData(BrainTemplate $template): array
    {
        return [
            'id' => $template->id, 'slug' => $template->slug, 'version' => $template->version,
            'name' => $template->name, 'category' => $template->category, 'price' => $template->price,
            'currency' => $template->currency, 'compatible_kinds' => $template->compatible_kinds,
            'program' => $this->programs->validateProgram($template->program),
        ];
    }
}
