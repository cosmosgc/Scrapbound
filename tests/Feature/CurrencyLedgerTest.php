<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientFundsException;
use App\Models\CurrencyLedgerEntry;
use App\Models\User;
use App\Services\CurrencyLedger;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CurrencyLedgerTest extends TestCase
{
    use RefreshDatabase;

    public function test_starter_wallet_is_audited_and_delivery_grants_are_idempotent(): void
    {
        $user = User::create(['username' => 'LedgerPilot', 'password' => 'safe-example-password']);
        $ledger = app(CurrencyLedger::class);

        $wallet = $ledger->walletFor($user);
        $this->assertSame(120, $wallet->credits);
        $this->assertSame(18, $wallet->scrap);
        $this->assertSame(2, CurrencyLedgerEntry::where('user_id', $user->id)->count());

        $grant = $ledger->grant($user, 'credits', 25, 'delivery:run-001', 'robot_delivery', ['robot_id' => 2]);
        $replay = $ledger->grant($user, 'credits', 25, 'delivery:run-001', 'robot_delivery', ['robot_id' => 2]);

        $this->assertSame(145, $grant['wallet']->credits);
        $this->assertFalse($grant['replayed']);
        $this->assertTrue($replay['replayed']);
        $this->assertSame(3, CurrencyLedgerEntry::where('user_id', $user->id)->count());
        $this->assertSame(145, $replay['entry']->balance_after);
    }

    public function test_spends_are_atomic_audited_and_cannot_overdraw(): void
    {
        $user = User::create(['username' => 'SpendPilot', 'password' => 'safe-example-password']);
        $ledger = app(CurrencyLedger::class);
        $ledger->walletFor($user);

        $spend = $ledger->spend($user, 'scrap', 8, 'purchase:item-1', 'robot_purchase');
        $replay = $ledger->spend($user, 'scrap', 8, 'purchase:item-1', 'robot_purchase');

        $this->assertSame(10, $spend['wallet']->scrap);
        $this->assertTrue($replay['replayed']);
        $this->assertSame('spend', $spend['entry']->type);

        try {
            $ledger->spend($user, 'scrap', 11, 'purchase:item-2', 'robot_purchase');
            $this->fail('An unaffordable spend should be rejected.');
        } catch (InsufficientFundsException) {
            $this->assertSame(10, $ledger->walletFor($user)->scrap);
            $this->assertDatabaseMissing('currency_ledger_entries', ['idempotency_key' => 'purchase:item-2']);
        }
    }

    public function test_reusing_an_idempotency_key_for_a_different_mutation_is_rejected(): void
    {
        $user = User::create(['username' => 'IdempotentPilot', 'password' => 'safe-example-password']);
        $ledger = app(CurrencyLedger::class);
        $ledger->grant($user, 'credits', 10, 'delivery:run-003', 'robot_delivery', ['robot_id' => 0]);

        $this->expectException(DomainException::class);
        $ledger->grant($user, 'credits', 10, 'delivery:run-003', 'robot_delivery', ['robot_id' => 1]);
    }

    public function test_wallet_api_requires_authentication_and_spend_is_idempotent(): void
    {
        $this->getJson('/api.php?action=wallet')->assertUnauthorized();
        $user = User::create(['username' => 'WalletApiPilot', 'password' => 'safe-example-password']);

        $this->actingAs($user)->getJson('/api.php?action=wallet')
            ->assertOk()->assertJsonPath('wallet.credits', 120)->assertJsonPath('wallet.scrap', 18)
            ->assertJsonCount(2, 'entries');
        $payload = ['resource' => 'credits', 'amount' => 30, 'idempotency_key' => 'api:purchase-001', 'reason' => 'robot_purchase'];
        $this->postJson('/api.php?action=wallet_spend', $payload)->assertOk()->assertJsonPath('wallet.credits', 90)->assertJsonPath('replayed', false);
        $this->postJson('/api.php?action=wallet_spend', $payload)->assertOk()->assertJsonPath('wallet.credits', 90)->assertJsonPath('replayed', true);
        $this->postJson('/api.php?action=wallet_spend', [...$payload, 'idempotency_key' => 'api:overspend-01', 'amount' => 1000])
            ->assertStatus(409)->assertJsonPath('error', 'Insufficient funds.');
        $this->assertSame(90, $user->wallet()->firstOrFail()->credits);
    }
}
