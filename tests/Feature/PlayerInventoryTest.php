<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PlayerInventory;
use App\Services\PlayerJobService;
use Database\Seeders\DatabaseSeeder;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayerInventoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    private function pilot(string $username = 'InventoryPilot'): User
    {
        $user = User::create(['username' => $username, 'password' => 'safe-example-password']);
        $user->assignRole('player');
        app(PlayerJobService::class)->ensurePlayer($user);
        return $user;
    }

    public function test_inventory_is_private_and_lists_only_server_owned_item_balances(): void
    {
        $user = $this->pilot();
        $this->getJson('/api.php?action=inventory')->assertUnauthorized();
        $this->actingAs($user)->getJson('/api.php?action=inventory')->assertOk()->assertJsonCount(0, 'items');
        app(PlayerInventory::class)->grant($user, 'alloy', 4, 'test-alloy-grant-001', 'mission_salvage', ['run_key' => 'test-run-001']);
        $this->actingAs($user)->getJson('/api.php?action=inventory')
            ->assertOk()->assertJsonPath('items.0.id', 'alloy')->assertJsonPath('items.0.quantity', 4)->assertJsonPath('items.0.available', 4);
        $other = $this->pilot('InventoryOther');
        $this->actingAs($other)->getJson('/api.php?action=inventory')->assertOk()->assertJsonCount(0, 'items');
    }

    public function test_item_reservations_spending_and_idempotent_receipts_preserve_available_quantity(): void
    {
        $user = $this->pilot();
        $inventory = app(PlayerInventory::class);
        $inventory->grant($user, 'alloy', 5, 'test-inventory-grant', 'mission_salvage');
        try {
            $inventory->grant($user, 'alloy', 1, 'test-inventory-grant', 'mission_salvage');
            $this->fail('Reusing an inventory receipt key with different quantities must be rejected.');
        } catch (DomainException $exception) {
            $this->assertSame('Inventory idempotency key was already used for a different mutation.', $exception->getMessage());
        }
        $reserved = $inventory->reserve($user, 'alloy', 3, 'test-inventory-reserve', 'trade_escrow');
        $this->assertSame(2, $reserved['inventory']['items'][0]['available']);
        $replayed = $inventory->reserve($user, 'alloy', 3, 'test-inventory-reserve', 'trade_escrow');
        $this->assertTrue($replayed['replayed']);
        $this->assertDatabaseCount('player_inventory_receipts', 2);

        try {
            $inventory->spend($user, 'alloy', 3, 'test-inventory-spend', 'crafting_cost');
            $this->fail('Reserved items cannot be spent.');
        } catch (DomainException $exception) {
            $this->assertSame('Not enough available items.', $exception->getMessage());
        }
        $inventory->release($user, 'alloy', 1, 'test-inventory-release', 'trade_cancel');
        $spent = $inventory->spend($user, 'alloy', 3, 'test-inventory-spend', 'crafting_cost');
        $this->assertSame(2, $spent['inventory']['items'][0]['quantity']);
        $this->assertSame(0, $spent['inventory']['items'][0]['available']);
        $this->assertDatabaseCount('player_inventory_receipts', 4);
    }

    public function test_item_mutations_reject_unknown_items_and_idempotency_key_conflicts(): void
    {
        $user = $this->pilot();
        $inventory = app(PlayerInventory::class);
        $this->expectException(DomainException::class);
        $inventory->grant($user, 'browser_invented_item', 1, 'unknown-item-key', 'mission_salvage');
    }
}
