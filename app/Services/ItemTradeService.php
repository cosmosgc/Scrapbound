<?php

namespace App\Services;

use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;

class ItemTradeService
{
    public function __construct(
        private readonly GameCatalog $catalog,
        private readonly PlayerInventory $inventory,
        private readonly CurrencyLedger $ledger,
    ) {}

    public function players(User $viewer): array
    {
        return User::query()->where('id', '!=', $viewer->id)->orderBy('username')->limit(100)->get(['id', 'username'])
            ->map(fn (User $user): array => ['id' => $user->id, 'username' => $user->username])->all();
    }

    public function overview(User $user): array
    {
        $this->expireDue();
        $trades = DB::table('item_trades')->join('users as sellers', 'sellers.id', '=', 'item_trades.seller_id')
            ->join('users as recipients', 'recipients.id', '=', 'item_trades.recipient_id')
            ->where(fn ($query) => $query->where('seller_id', $user->id)->orWhere('recipient_id', $user->id))
            ->latest('item_trades.id')->limit(30)->get(['item_trades.id', 'seller_id', 'sellers.username as seller', 'recipient_id',
                'recipients.username as recipient', 'item_id', 'item_snapshot', 'quantity', 'credit_price', 'status', 'expires_at', 'item_trades.created_at'])
            ->map(function ($trade) use ($user): array {
                return ['id' => (int) $trade->id, 'seller_id' => (int) $trade->seller_id, 'seller' => $trade->seller,
                    'recipient_id' => (int) $trade->recipient_id, 'recipient' => $trade->recipient, 'item_id' => $trade->item_id,
                    'item_name' => json_decode($trade->item_snapshot, true)['name'] ?? $trade->item_id, 'quantity' => (int) $trade->quantity,
                    'credit_price' => (int) $trade->credit_price, 'status' => $trade->status,
                    'expires_at' => $trade->expires_at, 'created_at' => $trade->created_at,
                    'can_accept' => $trade->status === 'open' && (int) $trade->recipient_id === (int) $user->id,
                    'can_cancel' => $trade->status === 'open' && (int) $trade->seller_id === (int) $user->id];
            })->all();
        return ['ok' => true, 'trades' => $trades];
    }

    public function create(User $seller, int $recipientId, string $itemId, int $quantity, int $creditPrice, string $createKey): array
    {
        if ((int) $seller->id === $recipientId) {
            throw new DomainException('You cannot create a trade with yourself.');
        }
        if ($quantity < 1 || $quantity > (int) config('trades.maximum_quantity', 1000)
            || $creditPrice < 1 || $creditPrice > (int) config('trades.maximum_credit_price', 1000000)
            || ! preg_match('/^[A-Za-z0-9._:-]{8,64}$/', $createKey)) {
            throw new DomainException('Invalid trade quantity, price, or request key.');
        }
        $catalog = $this->catalog->active();
        $definition = collect($catalog['inventoryItems'])->firstWhere('id', $itemId);
        if (! $definition || ! $definition['tradable']) {
            throw new DomainException('That inventory item cannot be traded.');
        }
        $hash = hash('sha256', json_encode([$recipientId, $itemId, $quantity, $creditPrice, $definition, $catalog['version']], JSON_THROW_ON_ERROR));
        return DB::transaction(function () use ($seller, $recipientId, $itemId, $quantity, $creditPrice, $createKey, $catalog, $definition, $hash): array {
            User::query()->whereIn('id', [$seller->id, $recipientId])->orderBy('id')->lockForUpdate()->get();
            $existing = DB::table('item_trades')->where('seller_id', $seller->id)->where('create_key', $createKey)->first();
            if ($existing) {
                if (! hash_equals($existing->input_hash, $hash)) {
                    throw new DomainException('Trade request key was already used for different terms.');
                }
                return ['trade' => $this->tradeData($existing), 'replayed' => true];
            }
            if (! User::query()->whereKey($recipientId)->exists()) {
                throw new DomainException('Trade recipient does not exist.');
            }
            $tradeId = DB::table('item_trades')->insertGetId([
                'seller_id' => $seller->id, 'recipient_id' => $recipientId, 'item_id' => $itemId,
                'item_snapshot' => json_encode($definition, JSON_THROW_ON_ERROR), 'quantity' => $quantity,
                'credit_price' => $creditPrice, 'catalog_version' => $catalog['version'], 'create_key' => $createKey,
                'input_hash' => $hash, 'status' => 'open', 'expires_at' => now()->addHours((int) config('trades.expiry_hours', 48)),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->inventory->reserve($seller, $itemId, $quantity, "trade:{$tradeId}:reserve", 'item_trade_escrow', ['trade_id' => $tradeId]);
            $this->audit($tradeId, $seller->id, 'created', ['recipient_id' => $recipientId, 'item_id' => $itemId, 'quantity' => $quantity, 'credit_price' => $creditPrice]);
            return ['trade' => $this->tradeData(DB::table('item_trades')->where('id', $tradeId)->first()), 'replayed' => false];
        });
    }

    public function accept(User $recipient, int $tradeId): array
    {
        return DB::transaction(function () use ($recipient, $tradeId): array {
            $trade = DB::table('item_trades')->where('id', $tradeId)->lockForUpdate()->first();
            if (! $trade) throw new DomainException('Trade offer not found.');
            if ($trade->status === 'accepted' && (int) $trade->recipient_id === (int) $recipient->id) return ['trade' => $this->tradeData($trade), 'replayed' => true];
            if ((int) $trade->recipient_id !== (int) $recipient->id) throw new DomainException('Only the named recipient can accept this offer.');
            if ($this->expireLocked($trade)) return ['error' => 'This trade offer has expired.'];
            if ($trade->status !== 'open') throw new DomainException('This trade offer is no longer open.');
            $this->lockParticipants($trade);
            $seller = User::query()->findOrFail($trade->seller_id);
            $definition = json_decode($trade->item_snapshot, true);
            $metadata = ['trade_id' => (int) $trade->id, 'item_id' => $trade->item_id];
            $this->ledger->spend($recipient, 'credits', (int) $trade->credit_price, "trade:{$trade->id}:buyer", 'item_trade_purchase', $metadata);
            $this->inventory->release($seller, $trade->item_id, (int) $trade->quantity, "trade:{$trade->id}:release", 'item_trade_settlement', ['trade_id' => (int) $trade->id]);
            $this->inventory->spend($seller, $trade->item_id, (int) $trade->quantity, "trade:{$trade->id}:seller", 'item_trade_transfer', ['trade_id' => (int) $trade->id]);
            $this->inventory->grant($recipient, $trade->item_id, (int) $trade->quantity, "trade:{$trade->id}:buyer-item", 'item_trade_transfer', ['trade_id' => (int) $trade->id], [$definition]);
            $this->ledger->grant($seller, 'credits', (int) $trade->credit_price, "trade:{$trade->id}:seller-credit", 'item_trade_sale', $metadata);
            DB::table('item_trades')->where('id', $trade->id)->update(['status' => 'accepted', 'resolved_at' => now(), 'updated_at' => now()]);
            $this->audit((int) $trade->id, $recipient->id, 'accepted', $metadata);
            return ['trade' => $this->tradeData(DB::table('item_trades')->where('id', $trade->id)->first()), 'replayed' => false];
        });
    }

    public function decline(User $recipient, int $tradeId): array
    {
        return $this->resolveOpenTrade($recipient, $tradeId, 'declined', 'declined');
    }

    public function cancel(User $seller, int $tradeId): array
    {
        return $this->resolveOpenTrade($seller, $tradeId, 'cancelled', 'cancelled');
    }

    public function expireDue(): int
    {
        $expired = 0;
        DB::table('item_trades')->where('status', 'open')->where('expires_at', '<=', now())->orderBy('id')->limit(100)->pluck('id')
            ->each(function ($id) use (&$expired): void {
                $didExpire = DB::transaction(function () use ($id): bool {
                    $trade = DB::table('item_trades')->where('id', $id)->lockForUpdate()->first();
                    return $trade ? $this->expireLocked($trade) : false;
                });
                $expired += $didExpire ? 1 : 0;
            });
        return $expired;
    }

    private function resolveOpenTrade(User $actor, int $tradeId, string $status, string $event): array
    {
        return DB::transaction(function () use ($actor, $tradeId, $status, $event): array {
            $trade = DB::table('item_trades')->where('id', $tradeId)->lockForUpdate()->first();
            if (! $trade) throw new DomainException('Trade offer not found.');
            $expected = $status === 'cancelled' ? (int) $trade->seller_id : (int) $trade->recipient_id;
            if ((int) $actor->id !== $expected) throw new DomainException($status === 'cancelled' ? 'Only the seller can cancel this offer.' : 'Only the named recipient can decline this offer.');
            if ($trade->status === $status) return ['trade' => $this->tradeData($trade), 'replayed' => true];
            if ($this->expireLocked($trade)) return ['error' => 'This trade offer has expired.'];
            if ($trade->status !== 'open') throw new DomainException('This trade offer is no longer open.');
            $seller = User::query()->findOrFail($trade->seller_id);
            $this->inventory->release($seller, $trade->item_id, (int) $trade->quantity, "trade:{$trade->id}:release", 'item_trade_release', ['trade_id' => (int) $trade->id]);
            DB::table('item_trades')->where('id', $trade->id)->update(['status' => $status, 'resolved_at' => now(), 'updated_at' => now()]);
            $this->audit((int) $trade->id, $actor->id, $event, []);
            return ['trade' => $this->tradeData(DB::table('item_trades')->where('id', $trade->id)->first()), 'replayed' => false];
        });
    }

    private function expireLocked(object $trade): bool
    {
        if ($trade->status !== 'open' || now()->lt($trade->expires_at)) return false;
        $seller = User::query()->find($trade->seller_id);
        if ($seller) $this->inventory->release($seller, $trade->item_id, (int) $trade->quantity, "trade:{$trade->id}:release", 'item_trade_expiry', ['trade_id' => (int) $trade->id]);
        DB::table('item_trades')->where('id', $trade->id)->update(['status' => 'expired', 'resolved_at' => now(), 'updated_at' => now()]);
        $this->audit((int) $trade->id, null, 'expired', []);
        return true;
    }

    private function lockParticipants(object $trade): void
    {
        User::query()->whereIn('id', [$trade->seller_id, $trade->recipient_id])->orderBy('id')->lockForUpdate()->get();
    }

    private function tradeData(object $trade): array
    {
        return ['id' => (int) $trade->id, 'seller_id' => (int) $trade->seller_id, 'recipient_id' => (int) $trade->recipient_id,
            'item_id' => $trade->item_id, 'item_name' => json_decode($trade->item_snapshot, true)['name'] ?? $trade->item_id,
            'quantity' => (int) $trade->quantity, 'credit_price' => (int) $trade->credit_price, 'status' => $trade->status,
            'expires_at' => $trade->expires_at];
    }

    private function audit(int $tradeId, ?int $actorId, string $event, array $metadata): void
    {
        DB::table('item_trade_audits')->insert(['trade_id' => $tradeId, 'trade_ref' => $tradeId, 'actor_id' => $actorId,
            'event' => $event, 'metadata' => $metadata ? json_encode($metadata, JSON_THROW_ON_ERROR) : null, 'created_at' => now()]);
    }
}
