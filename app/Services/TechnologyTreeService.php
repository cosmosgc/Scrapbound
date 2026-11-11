<?php

namespace App\Services;

use App\Exceptions\InsufficientFundsException;
use App\Models\PlayerTechnologyPurchaseReceipt;
use App\Models\PlayerTechnologyUnlock;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class TechnologyTreeService
{
    public function __construct(private readonly GameCatalog $catalog, private readonly CurrencyLedger $ledger) {}

    public function overview(User $user): array
    {
        $catalog = $this->catalog->active();
        $unlocks = PlayerTechnologyUnlock::query()->where('user_id', $user->id)->orderBy('id')->get();
        $owned = $unlocks->pluck('node_id')->all();
        $nodes = array_map(fn (array $node): array => [
            ...$node,
            'owned' => in_array($node['id'], $owned, true),
            'available' => ! in_array($node['id'], $owned, true) && ! array_diff($node['prerequisites'], $owned),
        ], $catalog['technologyNodes']);

        return [
            'ok' => true,
            'catalog_version' => $catalog['version'],
            'nodes' => $nodes,
            'owned_node_ids' => $owned,
            'effects' => $this->mergeEffects($unlocks->pluck('effects')->all()),
            'resources' => $catalog['resources'],
        ];
    }

    public function effectsFor(User $user): array
    {
        return $this->mergeEffects(PlayerTechnologyUnlock::query()->where('user_id', $user->id)->orderBy('id')->pluck('effects')->all());
    }

    public function purchase(User $user, string $nodeId, string $requestKey): array
    {
        return DB::transaction(function () use ($user, $nodeId, $requestKey): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $receipt = PlayerTechnologyPurchaseReceipt::query()->where('user_id', $user->id)->where('request_key', $requestKey)->first();
            if ($receipt) {
                if ($receipt->node_id !== $nodeId) {
                    throw new DomainException('Technology purchase key was already used for a different node.');
                }

                return [...$receipt->result, 'replayed' => true];
            }

            $catalog = $this->catalog->active();
            $node = collect($catalog['technologyNodes'])->firstWhere('id', $nodeId);
            if (! $node) {
                throw new DomainException('Technology node is not available in the active catalog.');
            }
            $unlocks = PlayerTechnologyUnlock::query()->where('user_id', $user->id)->orderBy('id')->get();
            $ownedIds = $unlocks->pluck('node_id')->all();
            if (in_array($nodeId, $ownedIds, true)) {
                throw new DomainException('Technology node is already unlocked.');
            }
            if (array_diff($node['prerequisites'], $ownedIds)) {
                throw new DomainException('Unlock the prerequisite technology first.');
            }

            $wallet = $this->ledger->walletFor($user);
            if ($node['cost'] > 0) {
                $wallet = $this->ledger->spend(
                    $user,
                    $node['currency'],
                    $node['cost'],
                    'tech:'.$requestKey,
                    'technology_purchase',
                    ['node_id' => $nodeId, 'catalog_version' => $catalog['version']],
                )['wallet'];
            }
            PlayerTechnologyUnlock::create([
                'user_id' => $user->id,
                'node_id' => $nodeId,
                'catalog_version' => $catalog['version'],
                'effects' => $node['effects'],
                'purchased_at' => now(),
            ]);
            $result = [
                'ok' => true,
                'node_id' => $nodeId,
                'technology' => $this->overview($user),
                'wallet' => ['credits' => $wallet->credits, 'scrap' => $wallet->scrap],
            ];
            PlayerTechnologyPurchaseReceipt::create([
                'user_id' => $user->id,
                'request_key' => $requestKey,
                'node_id' => $nodeId,
                'input_hash' => hash('sha256', json_encode([
                    'node_id' => $nodeId, 'catalog_version' => $catalog['version'], 'effects' => $node['effects'],
                ], JSON_THROW_ON_ERROR)),
                'result' => $result,
            ]);

            return [...$result, 'replayed' => false];
        });
    }

    private function mergeEffects(array $effectSets): array
    {
        $listKeys = ['unlockResources', 'unlockZones', 'unlockCapabilities', 'unlockPrograms', 'unlockModules', 'unlockBotKinds', 'sceneUnlocks'];
        $merged = array_fill_keys($listKeys, []);
        $merged += ['spawnWeightMultipliers' => [], 'deliveryValueMultipliers' => [], 'stockMultipliers' => [], 'respawnTimeMultipliers' => []];
        $merged['offlineSecondsBonus'] = 0;
        foreach ($effectSets as $effects) {
            foreach ($listKeys as $listKey) {
                $merged[$listKey] = array_values(array_unique([...$merged[$listKey], ...($effects[$listKey] ?? [])]));
            }
            $merged['offlineSecondsBonus'] = min(14400, $merged['offlineSecondsBonus'] + (int) ($effects['offlineSecondsBonus'] ?? 0));
            foreach (['spawnWeightMultipliers', 'deliveryValueMultipliers', 'stockMultipliers', 'respawnTimeMultipliers'] as $mapKey) {
                foreach ($effects[$mapKey] ?? [] as $resourceId => $multiplier) {
                    $merged[$mapKey][$resourceId] = max(.1, min(5, ($merged[$mapKey][$resourceId] ?? 1) * (float) $multiplier));
                }
            }
        }

        // Earlier published nodes unlocked resources before zones were modeled.
        // Preserve those entitlements when loading their stored effect snapshots.
        $resourceDefinitions = collect($this->catalog->active()['resources'])->keyBy('id');
        foreach ($merged['unlockResources'] as $resourceId) {
            $zone = $resourceDefinitions->get($resourceId)['zone'] ?? null;
            if (is_string($zone)) {
                $merged['unlockZones'][] = $zone;
            }
        }
        $merged['unlockZones'] = array_values(array_unique($merged['unlockZones']));

        return $merged;
    }
}
