<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientFundsException;
use App\Models\User;
use App\Services\CurrencyLedger;
use App\Services\ItemTradeService;
use App\Services\PlayerInventory;
use App\Services\PlayerJobService;
use Database\Seeders\DatabaseSeeder;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;
use Tests\TestCase;

class ItemTradeServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $seller;
    private User $buyer;
    private User $outsider;
    private ItemTradeService $trades;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->seller = $this->pilot('TradeSeller');
        $this->buyer = $this->pilot('TradeBuyer');
        $this->outsider = $this->pilot('TradeOutsider');
        $this->trades = app(ItemTradeService::class);
        app(CurrencyLedger::class)->walletFor($this->seller);
        app(CurrencyLedger::class)->walletFor($this->buyer);
        app(CurrencyLedger::class)->walletFor($this->outsider);
        app(PlayerInventory::class)->grant($this->seller, 'alloy', 10, 'trade-test-initial-grant', 'mission_salvage');
    }

    private function pilot(string $username): User
    {
        $user = User::create(['username' => $username, 'password' => 'safe-example-password']);
        $user->assignRole('player');
        app(PlayerJobService::class)->ensurePlayer($user);
        return $user;
    }

    private function offer(int $quantity = 3, int $price = 25, string $key = 'trade-test-create-001'): array
    {
        return $this->trades->create($this->seller, $this->buyer->id, 'alloy', $quantity, $price, $key);
    }

    public function test_offer_reserves_items_is_idempotent_and_accept_settles_items_credits_and_audit_atomically(): void
    {
        $created = $this->offer();
        $tradeId = $created['trade']['id'];
        $this->assertFalse($created['replayed']);
        $this->assertSame(7, app(PlayerInventory::class)->overview($this->seller)['items'][0]['available']);
        $retry = $this->offer();
        $this->assertTrue($retry['replayed']);
        $this->assertSame($tradeId, $retry['trade']['id']);
        $this->assertDatabaseCount('item_trade_audits', 1);

        $accepted = $this->trades->accept($this->buyer, $tradeId);
        $this->assertSame('accepted', $accepted['trade']['status']);
        $this->assertFalse($accepted['replayed']);
        $this->assertSame(120 - 25, (int) $this->buyer->wallet()->firstOrFail()->credits);
        $this->assertSame(120 + 25, (int) $this->seller->wallet()->firstOrFail()->credits);
        $this->assertSame(7, app(PlayerInventory::class)->overview($this->seller)['items'][0]['quantity']);
        $buyerItems = app(PlayerInventory::class)->overview($this->buyer)['items'];
        $this->assertSame(3, $buyerItems[0]['quantity']);
        $this->assertSame(0, $buyerItems[0]['reserved']);
        $this->assertSame('accepted', $this->trades->accept($this->buyer, $tradeId)['trade']['status']);
        $this->assertSame(2, DB::table('item_trade_audits')->where('trade_ref', $tradeId)->count());
        $this->assertSame(1, DB::table('currency_ledger_entries')->where('idempotency_key', "trade:{$tradeId}:buyer")->count());
    }

    public function test_insufficient_credits_roll_back_every_settlement_write(): void
    {
        $created = $this->offer(2, 121, 'trade-insufficient-create');
        try {
            $this->trades->accept($this->buyer, $created['trade']['id']);
            $this->fail('Buyer with insufficient credits cannot accept.');
        } catch (InsufficientFundsException $exception) {
            $this->assertSame('Insufficient funds.', $exception->getMessage());
        }

        $this->assertDatabaseHas('item_trades', ['id' => $created['trade']['id'], 'status' => 'open']);
        $this->assertSame(120, (int) $this->buyer->wallet()->firstOrFail()->credits);
        $this->assertSame(120, (int) $this->seller->wallet()->firstOrFail()->credits);
        $this->assertSame(10, app(PlayerInventory::class)->overview($this->seller)['items'][0]['quantity']);
        $this->assertSame(2, app(PlayerInventory::class)->overview($this->seller)['items'][0]['reserved']);
        $this->assertDatabaseMissing('currency_ledger_entries', ['idempotency_key' => "trade:{$created['trade']['id']}:buyer"]);
        $this->assertSame(1, DB::table('item_trade_audits')->where('trade_ref', $created['trade']['id'])->count());
    }

    public function test_decline_cancel_and_expiry_release_escrow_exactly_once(): void
    {
        $declined = $this->offer(2, 10, 'trade-decline-create');
        $this->trades->decline($this->buyer, $declined['trade']['id']);
        $this->assertSame(10, app(PlayerInventory::class)->overview($this->seller)['items'][0]['available']);
        $this->assertTrue($this->trades->decline($this->buyer, $declined['trade']['id'])['replayed']);

        $cancelled = $this->offer(3, 10, 'trade-cancel-create');
        $this->trades->cancel($this->seller, $cancelled['trade']['id']);
        $this->assertSame(10, app(PlayerInventory::class)->overview($this->seller)['items'][0]['available']);

        $expired = $this->offer(4, 10, 'trade-expiry-create');
        DB::table('item_trades')->where('id', $expired['trade']['id'])->update(['expires_at' => now()->subSecond()]);
        $this->trades->expireDue();
        $this->assertDatabaseHas('item_trades', ['id' => $expired['trade']['id'], 'status' => 'expired']);
        $this->assertSame(10, app(PlayerInventory::class)->overview($this->seller)['items'][0]['available']);
        $this->assertSame(1, DB::table('item_trade_audits')->where('trade_ref', $expired['trade']['id'])->where('event', 'expired')->count());
    }

    public function test_only_trade_participants_can_resolve_and_self_trade_or_insufficient_inventory_is_rejected(): void
    {
        $created = $this->offer(2, 10, 'trade-unauthorized-create');
        foreach ([
            fn () => $this->trades->accept($this->outsider, $created['trade']['id']),
            fn () => $this->trades->decline($this->outsider, $created['trade']['id']),
            fn () => $this->trades->cancel($this->buyer, $created['trade']['id']),
            fn () => $this->trades->create($this->seller, $this->seller->id, 'alloy', 1, 10, 'trade-self-create'),
            fn () => $this->trades->create($this->seller, $this->buyer->id, 'alloy', 100, 10, 'trade-overdraw-create'),
        ] as $action) {
            try {
                $action();
                $this->fail('Unauthorized or invalid trade action should fail.');
            } catch (DomainException) {
                $this->assertSame('open', DB::table('item_trades')->where('id', $created['trade']['id'])->value('status'));
            }
        }
        $this->assertSame(2, app(PlayerInventory::class)->overview($this->seller)['items'][0]['reserved']);
    }

    public function test_controller_returns_conflict_for_insufficient_credits_without_opening_settlement(): void
    {
        $created = $this->offer(1, 121, 'trade-api-insufficient');
        $this->actingAs($this->buyer)->postJson('/api.php?action=item_trade_accept', ['trade_id' => $created['trade']['id']])
            ->assertStatus(409)->assertJsonPath('error', 'Insufficient credits to accept this offer.');
        $this->assertDatabaseHas('item_trades', ['id' => $created['trade']['id'], 'status' => 'open']);
    }

    public function test_trade_overview_api_is_private_and_returns_participant_offers(): void
    {
        $created = $this->offer(2, 10, 'trade-overview-create');
        $this->getJson('/api.php?action=item_trades')->assertUnauthorized();
        $this->actingAs($this->buyer)->getJson('/api.php?action=item_trades')->assertOk()
            ->assertJsonPath('trades.0.id', $created['trade']['id'])
            ->assertJsonPath('trades.0.can_accept', true)
            ->assertJsonPath('trades.0.status', 'open');
    }

    public function test_trade_expiry_is_checked_from_timestamp_when_offers_are_viewed(): void
    {
        $created = $this->offer(4, 10, 'trade-scheduled-expiry');
        DB::table('item_trades')->where('id', $created['trade']['id'])->update(['expires_at' => now()->subSecond()]);

        $overview = $this->trades->overview($this->buyer);

        $this->assertSame('expired', $overview['trades'][0]['status']);
        $this->assertDatabaseHas('item_trades', ['id' => $created['trade']['id'], 'status' => 'expired']);
        $this->assertSame(10, app(PlayerInventory::class)->overview($this->seller)['items'][0]['available']);
        $this->assertDatabaseHas('item_trade_audits', ['trade_ref' => $created['trade']['id'], 'event' => 'expired']);
    }

    public function test_trade_audit_records_cannot_be_updated_or_deleted(): void
    {
        $created = $this->offer(1, 10, 'trade-immutable-audit');
        $auditId = DB::table('item_trade_audits')->where('trade_ref', $created['trade']['id'])->value('id');

        try {
            DB::table('item_trade_audits')->where('id', $auditId)->update(['event' => 'tampered']);
            $this->fail('Audit records must not be mutable.');
        } catch (QueryException) {
            $this->assertDatabaseHas('item_trade_audits', ['id' => $auditId, 'event' => 'created']);
        }

        try {
            DB::table('item_trade_audits')->where('id', $auditId)->delete();
            $this->fail('Audit records must not be deletable.');
        } catch (QueryException) {
            $this->assertDatabaseHas('item_trade_audits', ['id' => $auditId, 'event' => 'created']);
        }
    }
}
