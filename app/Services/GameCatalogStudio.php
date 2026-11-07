<?php

namespace App\Services;

use App\Models\GameCatalogAudit;
use App\Models\GameCatalogVersion;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class GameCatalogStudio
{
    public function __construct(private readonly GameCatalog $catalog) {}

    public function overview(): array
    {
        return [
            'active' => $this->catalog->active(),
            'versions' => GameCatalogVersion::query()->latest('version')->limit(50)->get()
                ->map(fn (GameCatalogVersion $version) => [
                    'id' => $version->id,
                    'version' => $version->version,
                    'status' => $version->status,
                    'rollback_of' => $version->rollback_of,
                    'published_at' => $version->published_at?->toIso8601String(),
                    'created_at' => $version->created_at?->toIso8601String(),
                ])->all(),
        ];
    }

    public function preview(array $content): array
    {
        return $this->catalog->validate($content);
    }

    public function createDraft(User $actor, array $content): GameCatalogVersion
    {
        $validated = $this->preview($content);

        return DB::transaction(function () use ($actor, $validated): GameCatalogVersion {
            $version = ((int) GameCatalogVersion::query()->lockForUpdate()->max('version')) + 1;
            $draft = GameCatalogVersion::create([
                'version' => $version,
                'status' => 'draft',
                'content' => $validated,
                'created_by' => $actor->id,
            ]);
            $this->audit($actor, $draft, 'draft_created');

            return $draft;
        });
    }

    public function publish(User $actor, int $versionId): GameCatalogVersion
    {
        return DB::transaction(function () use ($actor, $versionId): GameCatalogVersion {
            $draft = GameCatalogVersion::query()->lockForUpdate()->findOrFail($versionId);
            if ($draft->status !== 'draft') {
                throw new DomainException('Only an unpublished draft can be published.');
            }
            $this->catalog->validate($draft->content);
            GameCatalogVersion::query()->where('status', 'published')->update(['status' => 'retired']);
            $draft->forceFill(['status' => 'published', 'published_at' => now()])->save();
            $this->audit($actor, $draft, 'published');

            return $draft->fresh();
        });
    }

    public function disable(User $actor, int $versionId): GameCatalogVersion
    {
        return DB::transaction(function () use ($actor, $versionId): GameCatalogVersion {
            $version = GameCatalogVersion::query()->lockForUpdate()->findOrFail($versionId);
            if ($version->status !== 'published') {
                throw new DomainException('Only the active catalog version can be disabled.');
            }
            $version->forceFill(['status' => 'retired'])->save();
            $this->audit($actor, $version, 'disabled');

            return $version->fresh();
        });
    }

    public function rollback(User $actor, int $sourceVersionId): GameCatalogVersion
    {
        return DB::transaction(function () use ($actor, $sourceVersionId): GameCatalogVersion {
            $source = GameCatalogVersion::query()->lockForUpdate()->findOrFail($sourceVersionId);
            $content = $this->catalog->validate($source->content);
            GameCatalogVersion::query()->where('status', 'published')->update(['status' => 'retired']);
            $newVersion = ((int) GameCatalogVersion::query()->lockForUpdate()->max('version')) + 1;
            $rollback = GameCatalogVersion::create([
                'version' => $newVersion,
                'status' => 'published',
                'content' => $content,
                'created_by' => $actor->id,
                'published_at' => now(),
                'rollback_of' => $source->id,
            ]);
            $this->audit($actor, $rollback, 'rollback_published', ['source_version' => $source->version]);

            return $rollback;
        });
    }

    private function audit(User $actor, GameCatalogVersion $version, string $action, array $metadata = []): void
    {
        GameCatalogAudit::create([
            'actor_id' => $actor->id,
            'version_id' => $version->id,
            'action' => $action,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
