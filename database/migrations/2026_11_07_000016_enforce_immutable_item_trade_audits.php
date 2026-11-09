<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'sqlite'], true)) {
            throw new RuntimeException("Immutable item trade audit triggers are not implemented for database driver [{$driver}].");
        }

        // Keep historical actor/trade identifiers without FK-driven nulling or cascading mutations.
        Schema::table('item_trade_audits', function (Blueprint $table): void {
            $table->dropForeign(['trade_id']);
            $table->dropForeign(['actor_id']);
        });

        if ($driver === 'mysql') {
            DB::unprepared("CREATE TRIGGER item_trade_audits_no_update BEFORE UPDATE ON item_trade_audits FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item trade audit records are immutable'");
            DB::unprepared("CREATE TRIGGER item_trade_audits_no_delete BEFORE DELETE ON item_trade_audits FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item trade audit records are immutable'");
        } elseif ($driver === 'sqlite') {
            DB::unprepared("CREATE TRIGGER item_trade_audits_no_update BEFORE UPDATE ON item_trade_audits BEGIN SELECT RAISE(ABORT, 'Item trade audit records are immutable'); END");
            DB::unprepared("CREATE TRIGGER item_trade_audits_no_delete BEFORE DELETE ON item_trade_audits BEGIN SELECT RAISE(ABORT, 'Item trade audit records are immutable'); END");
        }
    }

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();
        if ($driver === 'mysql') {
            DB::unprepared('DROP TRIGGER IF EXISTS item_trade_audits_no_update');
            DB::unprepared('DROP TRIGGER IF EXISTS item_trade_audits_no_delete');
        } elseif ($driver === 'sqlite') {
            DB::unprepared('DROP TRIGGER IF EXISTS item_trade_audits_no_update');
            DB::unprepared('DROP TRIGGER IF EXISTS item_trade_audits_no_delete');
        }

        Schema::table('item_trade_audits', function (Blueprint $table): void {
            $table->foreign('trade_id')->references('id')->on('item_trades')->nullOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
        });
    }
};
