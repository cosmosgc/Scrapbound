<?php

namespace App\Services;

use App\Exceptions\InsufficientFundsException;
use App\Models\CurrencyLedgerEntry;
use App\Models\User;
use App\Models\Wallet;
use DomainException;
use Illuminate\Support\Facades\DB;

class CurrencyLedger
{
    public const STARTING_BALANCES = ['credits' => 120, 'scrap' => 18];

    public function walletFor(User $user): Wallet
    {
        return DB::transaction(function () use ($user): Wallet {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $wallet = Wallet::query()->where('user_id', $user->id)->lockForUpdate()->first();
            if ($wallet) {
                return $wallet;
            }

            $wallet = Wallet::create(['user_id' => $user->id, 'credits' => 0, 'scrap' => 0]);
            foreach (self::STARTING_BALANCES as $resource => $amount) {
                $wallet->{$resource} = $amount;
                $wallet->save();
                CurrencyLedgerEntry::create([
                    'user_id' => $user->id,
                    'idempotency_key' => "starter:v1:{$resource}",
                    'type' => 'grant',
                    'resource' => $resource,
                    'amount' => $amount,
                    'balance_after' => $amount,
                    'reason' => 'starter_balance',
                ]);
            }

            return $wallet->refresh();
        });
    }

    public function grant(User $user, string $resource, int $amount, string $idempotencyKey, string $reason, array $metadata = []): array
    {
        return $this->mutate($user, $resource, $amount, $idempotencyKey, $reason, 'grant', $metadata);
    }

    public function spend(User $user, string $resource, int $amount, string $idempotencyKey, string $reason, array $metadata = []): array
    {
        return $this->mutate($user, $resource, $amount, $idempotencyKey, $reason, 'spend', $metadata);
    }

    private function mutate(User $user, string $resource, int $amount, string $key, string $reason, string $type, array $metadata): array
    {
        if (! in_array($resource, ['credits', 'scrap'], true) || $amount < 1 || $amount > 1_000_000_000) {
            throw new DomainException('Invalid currency ledger mutation.');
        }
        if (! preg_match('/^[A-Za-z0-9._:-]{8,64}$/', $key) || ! preg_match('/^[A-Za-z0-9._:-]{2,80}$/', $reason)) {
            throw new DomainException('Invalid ledger idempotency key or reason.');
        }

        return DB::transaction(function () use ($user, $resource, $amount, $key, $reason, $type, $metadata): array {
            $wallet = $this->walletFor($user);
            $existing = CurrencyLedgerEntry::query()
                ->where('user_id', $user->id)->where('idempotency_key', $key)->first();

            if ($existing) {
                if ($existing->type !== $type || $existing->resource !== $resource || $existing->amount !== $amount || $existing->reason !== $reason || $existing->metadata !== ($metadata ?: null)) {
                    throw new DomainException('Idempotency key was already used for a different ledger mutation.');
                }

                return ['wallet' => $wallet->refresh(), 'entry' => $existing, 'replayed' => true];
            }

            $wallet = Wallet::query()->whereKey($wallet->id)->lockForUpdate()->firstOrFail();
            $current = (int) $wallet->{$resource};
            if ($type === 'spend' && $current < $amount) {
                throw new InsufficientFundsException('Insufficient funds.');
            }
            $balance = $type === 'grant' ? $current + $amount : $current - $amount;
            $wallet->{$resource} = $balance;
            $wallet->save();

            $entry = CurrencyLedgerEntry::create([
                'user_id' => $user->id,
                'idempotency_key' => $key,
                'type' => $type,
                'resource' => $resource,
                'amount' => $amount,
                'balance_after' => $balance,
                'reason' => $reason,
                'metadata' => $metadata ?: null,
            ]);

            return ['wallet' => $wallet->refresh(), 'entry' => $entry, 'replayed' => false];
        });
    }
}
