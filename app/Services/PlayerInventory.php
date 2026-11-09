<?php

namespace App\Services;

use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class PlayerInventory
{
    public function __construct(private readonly GameCatalog $catalog) {}

    public function overview(User $user): array
    {
        $definitions = collect($this->catalog->active()['inventoryItems'])->keyBy('id');
        $items = DB::table('player_inventory')->where('user_id', $user->id)->where('quantity', '>', 0)->orderBy('item_id')->get()
            ->map(function ($row) use ($definitions): array {
                $definition = $definitions->get($row->item_id);
                return ['id' => $row->item_id, 'name' => $definition['name'] ?? $row->item_id,
                    'quantity' => (int) $row->quantity, 'reserved' => (int) $row->reserved_quantity,
                    'available' => (int) $row->quantity - (int) $row->reserved_quantity,
                    'tradable' => (bool) ($definition['tradable'] ?? false)];
            })->all();
        $receipts = DB::table('player_inventory_receipts')->where('user_id', $user->id)->latest('id')->limit(20)->get()
            ->map(fn ($receipt): array => ['item_id' => $receipt->item_id, 'action' => $receipt->action,
                'quantity' => (int) $receipt->quantity, 'reason' => $receipt->reason, 'created_at' => $receipt->created_at])->all();
        return ['ok' => true, 'items' => $items, 'receipts' => $receipts];
    }

    public function grant(User $user, string $itemId, int $quantity, string $key, string $reason, array $metadata = [], ?array $catalogItems = null): array
    {
        return $this->mutate($user, $itemId, $quantity, $key, $reason, 'grant', $metadata, $catalogItems);
    }

    public function spend(User $user, string $itemId, int $quantity, string $key, string $reason, array $metadata = []): array
    {
        return $this->mutate($user, $itemId, $quantity, $key, $reason, 'spend', $metadata);
    }

    public function reserve(User $user, string $itemId, int $quantity, string $key, string $reason, array $metadata = []): array
    {
        return $this->mutate($user, $itemId, $quantity, $key, $reason, 'reserve', $metadata);
    }

    public function release(User $user, string $itemId, int $quantity, string $key, string $reason, array $metadata = []): array
    {
        return $this->mutate($user, $itemId, $quantity, $key, $reason, 'release', $metadata);
    }

    private function mutate(User $user, string $itemId, int $quantity, string $key, string $reason, string $action, array $metadata, ?array $catalogItems = null): array
    {
        if (! preg_match('/^[a-z][a-z0-9_]{1,39}$/', $itemId) || $quantity < 1 || $quantity > 1000000
            || ! preg_match('/^[A-Za-z0-9._:-]{8,64}$/', $key) || ! preg_match('/^[A-Za-z0-9._:-]{2,80}$/', $reason)) {
            throw new DomainException('Invalid item inventory mutation.');
        }
        $definitions = $catalogItems ?? $this->catalog->active()['inventoryItems'];
        $definition = collect($definitions)->firstWhere('id', $itemId);
        if (! is_array($definition)) {
            throw new DomainException('That item is not defined in the active catalog.');
        }

        return DB::transaction(function () use ($user, $itemId, $quantity, $key, $reason, $action, $metadata, $definition): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $existing = DB::table('player_inventory_receipts')->where('user_id', $user->id)->where('idempotency_key', $key)->first();
            if ($existing) {
                if ($existing->item_id !== $itemId || $existing->action !== $action || (int) $existing->quantity !== $quantity
                    || $existing->reason !== $reason || json_decode($existing->metadata ?? 'null', true) !== ($metadata ?: null)) {
                    throw new DomainException('Inventory idempotency key was already used for a different mutation.');
                }
                return ['inventory' => $this->overview($user), 'replayed' => true];
            }

            $row = DB::table('player_inventory')->where('user_id', $user->id)->where('item_id', $itemId)->lockForUpdate()->first();
            $balance = (int) ($row->quantity ?? 0);
            $reserved = (int) ($row->reserved_quantity ?? 0);
            $available = $balance - $reserved;
            if ($action === 'grant') {
                if ($balance + $quantity > (int) $definition['maxStack']) {
                    throw new DomainException('That inventory stack is full.');
                }
                $balance += $quantity;
            } elseif ($action === 'spend') {
                if ($available < $quantity) {
                    throw new DomainException('Not enough available items.');
                }
                $balance -= $quantity;
            } elseif ($action === 'reserve') {
                if ($available < $quantity) {
                    throw new DomainException('Not enough available items to reserve.');
                }
                $reserved += $quantity;
            } else {
                if ($reserved < $quantity) {
                    throw new DomainException('Cannot release more items than are reserved.');
                }
                $reserved -= $quantity;
            }

            DB::table('player_inventory')->updateOrInsert(['user_id' => $user->id, 'item_id' => $itemId],
                ['quantity' => $balance, 'reserved_quantity' => $reserved, 'created_at' => $row->created_at ?? now(), 'updated_at' => now()]);
            DB::table('player_inventory_receipts')->insert([
                'user_id' => $user->id, 'item_id' => $itemId, 'idempotency_key' => $key, 'action' => $action,
                'quantity' => $quantity, 'balance_after' => $balance, 'reserved_after' => $reserved,
                'reason' => $reason, 'metadata' => $metadata ? json_encode($metadata, JSON_THROW_ON_ERROR) : null, 'created_at' => now(),
            ]);
            return ['inventory' => $this->overview($user), 'replayed' => false];
        });
    }
}
