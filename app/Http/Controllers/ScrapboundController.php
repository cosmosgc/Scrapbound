<?php

namespace App\Http\Controllers;

use App\Exceptions\InsufficientFundsException;
use App\Models\CommunityPost;
use App\Models\CommunityReply;
use App\Models\RobotSimulationRunReceipt;
use App\Models\User;
use App\Services\CommunityModerationService;
use App\Services\CooperativeJobService;
use App\Services\CurrencyLedger;
use App\Services\GameCatalog;
use App\Services\GameCatalogStudio;
use App\Services\ItemTradeService;
use App\Services\PlayerBattleService;
use App\Services\PlayerJobService;
use App\Services\PlayerInventory;
use App\Services\PlayerIdleProgressService;
use App\Services\PlayerMissionService;
use App\Services\PlayerPveBattleService;
use App\Services\RobotSimulationResolver;
use App\Services\TechnologyTreeService;
use DomainException;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class ScrapboundController extends Controller
{
    private function result(array $data, int $status = 200): JsonResponse
    {
        return response()->json($data, $status)->header('Cache-Control', 'no-store');
    }

    public function status(): JsonResponse
    {
        return $this->result(['ok' => true, 'player' => Auth::user() ? [
            'id' => Auth::id(),
            'username' => Auth::user()->username,
            'can_manage_catalog' => Gate::allows('manage-game-catalog'),
        ] : null, 'csrf' => csrf_token(), 'ready' => true]);
    }

    public function dispatch(Request $request): JsonResponse
    {
        try {
            return match ($request->query('action')) {
                'status' => $this->status(),
                'wallet' => $this->wallet(),
                'inventory' => $this->inventory(),
                'trade_players' => $this->tradePlayers(),
                'item_trades' => $this->itemTrades(),
                'item_trade_create' => $this->itemTradeCreate($request),
                'item_trade_accept' => $this->itemTradeAccept($request),
                'item_trade_decline' => $this->itemTradeDecline($request),
                'item_trade_cancel' => $this->itemTradeCancel($request),
                'wallet_spend' => $this->walletSpend($request),
                'robot_simulate' => $this->robotSimulate($request),
                'idle_settle' => $this->idleSettle($request),
                'technology' => $this->technology(),
                'technology_purchase' => $this->technologyPurchase($request),
                'catalog' => $this->catalog(),
                'catalog_studio' => $this->catalogStudio(),
                'catalog_preview' => $this->catalogPreview($request),
                'catalog_draft' => $this->catalogDraft($request),
                'catalog_publish' => $this->catalogPublish($request),
                'catalog_disable' => $this->catalogDisable($request),
                'catalog_rollback' => $this->catalogRollback($request),
                'jobs' => $this->jobs(),
                'robot_program' => $this->robotProgram($request),
                'robot_purchase' => $this->robotPurchase($request),
                'template_unlock' => $this->templateUnlock($request),
                'template_deploy' => $this->templateDeploy($request),
                'missions' => $this->missions(),
                'battle_defenses' => $this->battleDefenses(),
                'battle_publish_defense' => $this->battlePublishDefense($request),
                'battle_challenge' => $this->battleChallenge($request),
                'battle_history' => $this->battleHistory(),
                'battle_progression' => $this->battleProgression(),
                'pve_encounters' => $this->pveEncounters(),
                'pve_challenge' => $this->pveChallenge($request),
                'pve_history' => $this->pveHistory(),
                'mission_start' => $this->missionStart($request),
                'mission_claim' => $this->missionClaim($request),
                'cooperative_jobs' => $this->cooperativeJobs(),
                'cooperative_create' => $this->cooperativeCreate($request),
                'cooperative_join' => $this->cooperativeJoin($request),
                'cooperative_leave' => $this->cooperativeLeave($request),
                'community_feed' => $this->feed(),
                'register' => $this->register($request),
                'login' => $this->login($request),
                'logout' => $this->logout(),
                'community_post' => $this->createPost($request),
                'community_reply' => $this->reply($request),
                'community_join' => $this->join($request),
                'community_close' => $this->closePost($request),
                'community_report' => $this->reportPost($request),
                'community_block' => $this->blockPlayer($request),
                'community_unblock' => $this->unblockPlayer($request),
                'moderation_queue' => $this->moderationQueue(),
                'moderation_resolve' => $this->moderationResolve($request),
                default => $this->result(['ok' => false, 'error' => 'Unknown action.'], 404),
            };
        } catch (QueryException $exception) {
            report($exception);

            return $this->result(['ok' => false, 'error' => 'Database unavailable. Check Laravel database setup.'], 503);
        }
    }

    private function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'regex:/^[A-Za-z0-9_]{3,20}$/', 'unique:users,username'],
            'password' => ['required', 'string', 'min:8', 'max:72'],
        ]);
        $user = User::create(['username' => $data['username'], 'password' => Hash::make($data['password'])]);
        $user->assignRole(Role::findOrCreate('player', 'web'));
        app(CurrencyLedger::class)->walletFor($user);
        app(PlayerJobService::class)->ensurePlayer($user);
        Auth::login($user);
        $request->session()->regenerate();

        return $this->authenticated($user);
    }

    private function wallet(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view your wallet.');
        $wallet = app(CurrencyLedger::class)->walletFor(Auth::user());
        $entries = $wallet->ledgerEntries()->latest('id')->limit(25)->get([
            'id', 'type', 'resource', 'amount', 'balance_after', 'reason', 'idempotency_key', 'created_at',
        ]);

        return $this->result(['ok' => true, 'wallet' => ['credits' => $wallet->credits, 'scrap' => $wallet->scrap], 'entries' => $entries]);
    }

    private function inventory(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view your item inventory.');
        return $this->result(app(PlayerInventory::class)->overview(Auth::user()));
    }

    private function tradePlayers(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to browse trade partners.');
        return $this->result(['ok' => true, 'players' => app(ItemTradeService::class)->players(Auth::user())]);
    }

    private function itemTrades(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view item trades.');
        return $this->result(app(ItemTradeService::class)->overview(Auth::user()));
    }

    private function itemTradeCreate(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to create an item trade.');
        $data = $request->validate([
            'recipient_id' => ['required', 'integer', 'exists:users,id'], 'item_id' => ['required', 'regex:/^[a-z][a-z0-9_]{1,39}$/'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000'], 'credit_price' => ['required', 'integer', 'min:1', 'max:1000000'],
            'request_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,64}$/'],
        ]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'item-trade-create', 5, 3600)) return $limited;
        try {
            $outcome = app(ItemTradeService::class)->create(Auth::user(), (int) $data['recipient_id'], $data['item_id'],
                (int) $data['quantity'], (int) $data['credit_price'], $data['request_key']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
        return $this->result(['ok' => true, ...$outcome], $outcome['replayed'] ? 200 : 201);
    }

    private function itemTradeAccept(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to accept an item trade.');
        $data = $request->validate(['trade_id' => ['required', 'integer', 'min:1']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'item-trade-accept', 10, 3600)) return $limited;
        try { $outcome = app(ItemTradeService::class)->accept(Auth::user(), (int) $data['trade_id']); }
        catch (InsufficientFundsException) { return $this->result(['ok' => false, 'error' => 'Insufficient credits to accept this offer.'], 409); }
        catch (DomainException $exception) { return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409); }
        if (isset($outcome['error'])) return $this->result(['ok' => false, 'error' => $outcome['error']], 409);
        return $this->result(['ok' => true, ...$outcome]);
    }

    private function itemTradeDecline(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to decline an item trade.');
        $data = $request->validate(['trade_id' => ['required', 'integer', 'min:1']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'item-trade-decline', 10, 3600)) return $limited;
        try { $outcome = app(ItemTradeService::class)->decline(Auth::user(), (int) $data['trade_id']); }
        catch (DomainException $exception) { return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409); }
        if (isset($outcome['error'])) return $this->result(['ok' => false, 'error' => $outcome['error']], 409);
        return $this->result(['ok' => true, ...$outcome]);
    }

    private function itemTradeCancel(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to cancel an item trade.');
        $data = $request->validate(['trade_id' => ['required', 'integer', 'min:1']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'item-trade-cancel', 10, 3600)) return $limited;
        try { $outcome = app(ItemTradeService::class)->cancel(Auth::user(), (int) $data['trade_id']); }
        catch (DomainException $exception) { return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409); }
        if (isset($outcome['error'])) return $this->result(['ok' => false, 'error' => $outcome['error']], 409);
        return $this->result(['ok' => true, ...$outcome]);
    }

    private function walletSpend(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to spend currency.');
        $data = $request->validate([
            'resource' => ['required', Rule::in(['credits', 'scrap'])],
            'amount' => ['required', 'integer', 'min:1', 'max:1000000'],
            'idempotency_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,64}$/'],
            'reason' => ['required', Rule::in(['robot_purchase', 'upgrade_purchase'])],
        ]);

        try {
            $result = app(CurrencyLedger::class)->spend(
                Auth::user(), $data['resource'], (int) $data['amount'], $data['idempotency_key'], $data['reason'],
            );
        } catch (InsufficientFundsException) {
            return $this->result(['ok' => false, 'error' => 'Insufficient funds.'], 409);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result([
            'ok' => true,
            'wallet' => ['credits' => $result['wallet']->credits, 'scrap' => $result['wallet']->scrap],
            'entry' => $result['entry'],
            'replayed' => $result['replayed'],
        ]);
    }

    private function robotSimulate(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to run a robot simulation.');
        $data = $request->validate([
            'run_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,40}$/'],
            'seed' => ['required', 'integer', 'min:0', 'max:4294967295'],
            'ticks' => ['required', 'integer', 'min:1', 'max:6000'],
        ]);
        $user = Auth::user();
        $rateKey = 'robot-simulate:'.$user->id;

        return DB::transaction(function () use ($user, $data, $rateKey): JsonResponse {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $idleState = app(PlayerIdleProgressService::class)->stateForLockedUser($user);
            $jobState = app(PlayerJobService::class)->jobs($user);
            $owned = array_fill_keys(array_column(app(GameCatalog::class)->active()['items'], 'id'), 0);
            $unitPrograms = [];
            foreach ($jobState['robots'] as $robot) {
                if (array_key_exists($robot['kind'], $owned)) $owned[$robot['kind']]++;
                $unitPrograms[(int) $robot['id']] = $robot['program'];
            }
            $input = [
                // Keep online runs on the server-owned world seed used for offline catch-up.
                'seed' => (int) $idleState->world_seed, 'ticks' => (int) $data['ticks'],
                'assignments' => ['crew' => [], 'units' => $unitPrograms], 'owned' => $owned,
            ];
            $inputHash = hash('sha256', json_encode($this->canonicalize($input), JSON_THROW_ON_ERROR));
            $receipt = RobotSimulationRunReceipt::query()
                ->where('user_id', $user->id)->where('run_key', $data['run_key'])->first();
            if ($receipt) {
                if (! hash_equals($receipt->input_hash, $inputHash)) {
                    return $this->result(['ok' => false, 'error' => 'Run key was already used for a different simulation input.'], 409);
                }

                return $this->result([...$receipt->result, 'replayed' => true]);
            }

            if (RateLimiter::tooManyAttempts($rateKey, 1)) {
                return $this->result(['ok' => false, 'error' => 'Simulation rate limit reached. Try again shortly.'], 429);
            }
            RateLimiter::hit($rateKey, 60);

            $catalog = app(GameCatalog::class)->active();
            $resolved = app(RobotSimulationResolver::class)->resolve(
                $owned,
                $input['assignments'], $input['seed'], $input['ticks'], [], $catalog['rewards'],
                $catalog['resources'], app(TechnologyTreeService::class)->effectsFor($user),
            );
            $ledger = app(CurrencyLedger::class);
            $wallet = $ledger->walletFor($user);
            foreach ($resolved['payouts'] as $index => $payout) {
                $entryKey = 'sim:'.substr(hash('sha256', $data['run_key'].':'.$index), 0, 60);
                $mutation = $ledger->grant(
                    $user, $payout['resource'], $payout['amount'], $entryKey, 'robot_delivery',
                    ['run_key' => $data['run_key'], 'robot_id' => $payout['robot_id'], 'cargo' => $payout['cargo']],
                );
                $wallet = $mutation['wallet'];
            }

            $result = [
                'ok' => true,
                'core_version' => 6,
                'seed' => $input['seed'],
                'ticks' => $input['ticks'],
                'payouts' => $resolved['payouts'],
                'snapshot' => ['robots' => $resolved['robots'], 'nodes' => $resolved['nodes'], 'drops' => $resolved['drops']],
                'wallet' => ['credits' => $wallet->credits, 'scrap' => $wallet->scrap],
            ];
            RobotSimulationRunReceipt::create([
                'user_id' => $user->id, 'run_key' => $data['run_key'], 'input_hash' => $inputHash, 'result' => $result,
            ]);
            $idleState->last_settled_at = now();
            $idleState->save();

            return $this->result([...$result, 'replayed' => false]);
        });
    }

    private function idleSettle(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to settle offline robot progress.');
        $data = $request->validate([
            'request_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,40}$/'],
        ]);

        return $this->result(app(PlayerIdleProgressService::class)->settle(Auth::user(), $data['request_key']));
    }

    private function technology(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view technology research.');

        return $this->result(app(TechnologyTreeService::class)->overview(Auth::user()));
    }

    private function technologyPurchase(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to research technology.');
        $data = $request->validate([
            'node_id' => ['required', 'string', 'regex:/^[a-z][a-z0-9_]{1,39}$/'],
            'request_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,40}$/'],
        ]);
        try {
            return $this->result(app(TechnologyTreeService::class)->purchase(Auth::user(), $data['node_id'], $data['request_key']));
        } catch (InsufficientFundsException) {
            return $this->result(['ok' => false, 'error' => 'Insufficient funds for that research node.'], 409);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function catalog(): JsonResponse
    {
        try {
            return $this->result(['ok' => true, 'catalog' => app(GameCatalog::class)->active()]);
        } catch (DomainException $exception) {
            report($exception);

            return $this->result(['ok' => false, 'error' => 'The active game catalog is invalid.'], 503);
        }
    }

    private function catalogStudio(): JsonResponse
    {
        $this->authorizeCatalogManagement();

        return $this->result(['ok' => true, ...app(GameCatalogStudio::class)->overview()]);
    }

    private function catalogPreview(Request $request): JsonResponse
    {
        $this->authorizeCatalogManagement();
        $data = $request->validate(['content' => ['required', 'array']]);
        try {
            return $this->result(['ok' => true, 'preview' => app(GameCatalogStudio::class)->preview($data['content'])]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 422);
        }
    }

    private function catalogDraft(Request $request): JsonResponse
    {
        $this->authorizeCatalogManagement();
        $data = $request->validate(['content' => ['required', 'array']]);
        try {
            $draft = app(GameCatalogStudio::class)->createDraft(Auth::user(), $data['content']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 422);
        }

        return $this->result(['ok' => true, 'version' => $draft->version, 'id' => $draft->id, 'status' => $draft->status], 201);
    }

    private function catalogPublish(Request $request): JsonResponse
    {
        $this->authorizeCatalogManagement();
        $data = $request->validate(['version_id' => ['required', 'integer']]);
        try {
            $version = app(GameCatalogStudio::class)->publish(Auth::user(), (int) $data['version_id']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result(['ok' => true, 'version' => $version->version, 'status' => $version->status]);
    }

    private function catalogDisable(Request $request): JsonResponse
    {
        $this->authorizeCatalogManagement();
        $data = $request->validate(['version_id' => ['required', 'integer']]);
        try {
            $version = app(GameCatalogStudio::class)->disable(Auth::user(), (int) $data['version_id']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result(['ok' => true, 'version' => $version->version, 'status' => $version->status]);
    }

    private function catalogRollback(Request $request): JsonResponse
    {
        $this->authorizeCatalogManagement();
        $data = $request->validate(['source_version_id' => ['required', 'integer']]);
        try {
            $version = app(GameCatalogStudio::class)->rollback(Auth::user(), (int) $data['source_version_id']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result(['ok' => true, 'version' => $version->version, 'rollback_of' => $version->rollback_of]);
    }

    private function authorizeCatalogManagement(): void
    {
        abort_unless(Auth::check(), 401, 'Sign in to manage the game catalog.');
        abort_unless(Gate::allows('manage-game-catalog'), 403, 'Admin access required.');
    }

    private function jobs(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view persistent robot jobs.');

        return $this->result(['ok' => true, ...app(PlayerJobService::class)->jobs(Auth::user())]);
    }

    private function robotProgram(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to assign robot programs.');
        $data = $request->validate([
            'target' => ['required', 'regex:/^(all|0|[1-9]\d{0,1})$/'],
            'program' => ['required', 'array', 'max:40'],
        ]);
        try {
            return $this->result(['ok' => true, ...app(PlayerJobService::class)->assignProgram(Auth::user(), $data['target'], $data['program'])]);
        } catch (\InvalidArgumentException|DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 422);
        }
    }

    private function robotPurchase(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to purchase robots.');
        $data = $request->validate([
            'kind' => ['required', 'string', 'regex:/^[a-z][a-z0-9_]{1,39}$/'],
            'idempotency_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,64}$/'],
        ]);
        try {
            return $this->result(['ok' => true, ...app(PlayerJobService::class)->purchaseRobot(Auth::user(), $data['kind'], $data['idempotency_key'])]);
        } catch (InsufficientFundsException|DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function templateUnlock(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to unlock templates.');
        $data = $request->validate([
            'template_id' => ['required', 'integer', 'min:1'],
            'idempotency_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,64}$/'],
        ]);
        try {
            return $this->result(['ok' => true, ...app(PlayerJobService::class)->unlockTemplate(Auth::user(), $data['template_id'], $data['idempotency_key'])]);
        } catch (InsufficientFundsException|DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function templateDeploy(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to deploy templates.');
        $data = $request->validate([
            'template_id' => ['required', 'integer', 'min:1'],
            'target' => ['required', 'regex:/^(all|0|[1-9]\d{0,1})$/'],
        ]);
        try {
            return $this->result(['ok' => true, ...app(PlayerJobService::class)->deployTemplate(Auth::user(), $data['template_id'], $data['target'])]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function battleDefenses(): JsonResponse
    {
        return $this->result([
            'ok' => true,
            'defenses' => app(PlayerBattleService::class)->defenses(Auth::id()),
        ]);
    }

    private function battlePublishDefense(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to publish a defense.');
        $data = $request->validate(['unit_index' => ['required', 'integer', 'min:0', 'max:19']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'battle-defense', 5, 3600)) {
            return $limited;
        }
        try {
            return $this->result([
                'ok' => true,
                ...app(PlayerBattleService::class)->publishDefense(Auth::user(), (int) $data['unit_index']),
            ]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 422);
        }
    }

    private function battleChallenge(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to challenge a defense.');
        $data = $request->validate([
            'defender_id' => ['required', 'integer', 'exists:users,id'],
            'unit_index' => ['required', 'integer', 'min:0', 'max:19'],
            'run_key' => ['required', 'string', 'min:8', 'max:40'],
        ]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'battle-challenge', 5, 3600)) {
            return $limited;
        }
        try {
            $outcome = app(PlayerBattleService::class)->challenge(
                Auth::user(), (int) $data['defender_id'], (int) $data['unit_index'], $data['run_key'],
            );
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result(['ok' => true, ...$outcome], $outcome['replayed'] ? 200 : 201);
    }

    private function battleHistory(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view battle history.');

        return $this->result(['ok' => true, 'battles' => app(PlayerBattleService::class)->history(Auth::user())]);
    }

    private function battleProgression(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view season standings.');

        return $this->result(app(PlayerBattleService::class)->progression(Auth::user()));
    }

    private function pveEncounters(): JsonResponse
    {
        return $this->result(['ok' => true, 'encounters' => app(PlayerPveBattleService::class)->encounters()]);
    }

    private function pveChallenge(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to enter a PvE battle.');
        $data = $request->validate([
            'unit_index' => ['required', 'integer', 'min:0', 'max:19'],
            'encounter_id' => ['required', 'string', 'max:40'],
            'run_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,40}$/'],
        ]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'pve-battle', 10, 3600)) {
            return $limited;
        }
        try {
            $outcome = app(PlayerPveBattleService::class)->fight(Auth::user(), (int) $data['unit_index'], $data['encounter_id'], $data['run_key']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
        return $this->result(['ok' => true, ...$outcome], $outcome['replayed'] ? 200 : 201);
    }

    private function pveHistory(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view PvE battle history.');
        return $this->result(['ok' => true, 'battles' => app(PlayerPveBattleService::class)->history(Auth::user())]);
    }

    private function missions(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view missions.');

        return $this->result(['ok' => true, ...app(PlayerMissionService::class)->overview(Auth::user())]);
    }

    private function missionStart(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to launch missions.');
        $data = $request->validate([
            'sector' => ['required', 'integer', 'min:1', 'max:100'],
            'run_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,40}$/'],
            'cooperative_job_id' => ['nullable', 'integer', 'min:1', 'exists:cooperative_jobs,id'],
        ]);
        try {
            return $this->result(['ok' => true, ...app(PlayerMissionService::class)->start(
                Auth::user(), (int) $data['sector'], $data['run_key'], isset($data['cooperative_job_id']) ? (int) $data['cooperative_job_id'] : null,
            )]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function cooperativeJobs(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view cooperative jobs.');
        return $this->result(app(CooperativeJobService::class)->overview(Auth::user()));
    }

    private function cooperativeCreate(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to create a cooperative job.');
        $data = $request->validate(['sector' => ['required', 'integer', 'min:1', 'max:100'], 'goal' => ['required', 'integer', 'min:2', 'max:4']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'cooperative-create', 3, 3600)) {
            return $limited;
        }
        try {
            return $this->result(['ok' => true, ...app(CooperativeJobService::class)->create(Auth::user(), (int) $data['sector'], (int) $data['goal'])], 201);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function cooperativeJoin(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to join a cooperative job.');
        $data = $request->validate(['job_id' => ['required', 'integer', 'min:1']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'cooperative-join', 10, 3600)) {
            return $limited;
        }
        try {
            return $this->result(['ok' => true, ...app(CooperativeJobService::class)->join(Auth::user(), (int) $data['job_id'])]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function cooperativeLeave(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to leave a cooperative job.');
        $data = $request->validate(['job_id' => ['required', 'integer', 'min:1']]);
        try {
            return $this->result(['ok' => true, ...app(CooperativeJobService::class)->leave(Auth::user(), (int) $data['job_id'])]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function missionClaim(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to claim mission results.');
        $data = $request->validate(['run_key' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,40}$/']]);
        try {
            return $this->result(['ok' => true, ...app(PlayerMissionService::class)->claim(Auth::user(), $data['run_key'])]);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }
    }

    private function canonicalize(array $value): array
    {
        foreach ($value as &$item) {
            if (is_array($item)) {
                $item = $this->canonicalize($item);
            }
        }
        unset($item);
        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }

    private function login(Request $request): JsonResponse
    {
        $data = $request->validate(['username' => ['required', 'string'], 'password' => ['required', 'string', 'max:72']]);
        if (! Auth::attempt($data)) {
            return $this->result(['ok' => false, 'error' => 'Username or password is incorrect.'], 401);
        }
        $request->session()->regenerate();

        return $this->authenticated($request->user());
    }

    private function authenticated(User $user): JsonResponse
    {
        return $this->result(['ok' => true, 'player' => [
            'id' => $user->id,
            'username' => $user->username,
            'can_manage_catalog' => Gate::forUser($user)->allows('manage-game-catalog'),
        ], 'csrf' => csrf_token()]);
    }

    private function logout(): JsonResponse
    {
        Auth::logout();
        request()->session()->invalidate();
        request()->session()->regenerateToken();

        return $this->result(['ok' => true]);
    }

    private function feed(): JsonResponse
    {
        $excludedUserIds = [];
        if (Auth::check()) {
            $viewer = Auth::user();
            $excludedUserIds = $viewer->blockedUsers()->pluck('users.id')->merge($viewer->blockedByUsers()->pluck('users.id'))->unique()->values()->all();
        }
        $posts = CommunityPost::with(['user:id,username', 'replies.user:id,username'])
            ->where('is_hidden', false)
            ->when($excludedUserIds, fn ($query) => $query->whereNotIn('user_id', $excludedUserIds))
            ->withCount(['replies', 'members'])
            ->withExists(['members as is_member' => fn ($query) => $query->where('users.id', Auth::id() ?? 0)])
            ->orderByRaw("status = 'open' DESC")
            ->latest()->limit(60)->get()->map(fn (CommunityPost $post) => [
                'id' => $post->id, 'player_id' => $post->user_id, 'kind' => $post->kind,
                'title' => $post->title, 'body' => $post->body, 'offering' => $post->offering,
                'seeking' => $post->seeking, 'status' => $post->status, 'created_at' => $post->created_at,
                'username' => $post->user->username, 'reply_count' => $post->replies_count,
                'member_count' => $post->members_count, 'is_member' => (bool) $post->is_member,
                'is_mine' => (int) $post->user_id === (int) Auth::id(),
                'replies' => $post->replies->reject(fn ($reply) => in_array((int) $reply->user_id, $excludedUserIds, true))->map(fn ($reply) => ['username' => $reply->user->username, 'message' => $reply->message, 'created_at' => $reply->created_at]),
            ]);

        return $this->result([
            'ok' => true,
            'posts' => $posts,
            'player' => Auth::user() ? ['id' => Auth::id(), 'username' => Auth::user()->username] : null,
            'can_moderate' => Auth::check() && Gate::allows('view-moderation-queue'),
        ]);
    }

    private function createPost(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to do that.');
        $data = $request->validate([
            'kind' => ['required', Rule::in(['help', 'trade', 'collab'])],
            'title' => ['required', 'string', 'min:4', 'max:90'],
            'body' => ['required', 'string', 'min:8', 'max:600'],
            'offering' => ['nullable', 'string', 'max:120'], 'seeking' => ['nullable', 'string', 'max:120'],
        ]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'post', 5, 3600)) {
            return $limited;
        }
        if ($data['kind'] === 'trade' && (blank($data['offering'] ?? '') || blank($data['seeking'] ?? ''))) {
            return $this->result(['ok' => false, 'error' => 'Trade posts need both an offer and a request.'], 400);
        }
        $post = CommunityPost::create(array_merge($data, ['user_id' => Auth::id(), 'offering' => $data['offering'] ?? '', 'seeking' => $data['seeking'] ?? '']));

        return $this->result(['ok' => true, 'id' => $post->id]);
    }

    private function reply(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to do that.');
        $data = $request->validate(['post_id' => ['required', 'integer'], 'message' => ['required', 'string', 'min:2', 'max:400']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'reply', 20, 3600)) {
            return $limited;
        }
        $post = CommunityPost::whereKey($data['post_id'])->where('status', 'open')->first();
        if (! $post) {
            return $this->result(['ok' => false, 'error' => 'This post is no longer open.'], 404);
        }
        if ($this->usersBlockedFromEachOther(Auth::id(), $post->user_id)) {
            return $this->result(['ok' => false, 'error' => 'You cannot reply because one of these players has blocked the other.'], 403);
        }
        CommunityReply::create(['post_id' => $post->id, 'user_id' => Auth::id(), 'message' => $data['message']]);

        return $this->result(['ok' => true]);
    }

    private function join(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to do that.');
        $data = $request->validate(['post_id' => ['required', 'integer']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'join', 20, 3600)) {
            return $limited;
        }
        $post = CommunityPost::whereKey($data['post_id'])->where('status', 'open')->first();
        if (! $post) {
            return $this->result(['ok' => false, 'error' => 'This post is no longer open.'], 404);
        }
        if ($post->user_id === Auth::id()) {
            return $this->result(['ok' => false, 'error' => 'You cannot join your own post.'], 400);
        }
        if ($this->usersBlockedFromEachOther(Auth::id(), $post->user_id)) {
            return $this->result(['ok' => false, 'error' => 'You cannot join because one of these players has blocked the other.'], 403);
        }
        $joined = $post->members()->syncWithoutDetaching([Auth::id()]);

        return $this->result(['ok' => true, 'joined' => count($joined['attached']) > 0]);
    }

    private function closePost(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to do that.');
        $data = $request->validate(['post_id' => ['required', 'integer']]);
        $post = CommunityPost::whereKey($data['post_id'])->where('user_id', Auth::id())->where('status', 'open')->first();
        if (! $post) {
            return $this->result(['ok' => false, 'error' => 'Only the owner can close an open post.'], 403);
        }
        $post->update(['status' => $post->kind === 'trade' ? 'matched' : 'completed']);

        return $this->result(['ok' => true]);
    }

    private function reportPost(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to report a post.');
        $data = $request->validate([
            'post_id' => ['required', 'integer'],
            'reason' => ['required', Rule::in(['spam', 'harassment', 'scam', 'unsafe', 'other'])],
            'details' => ['nullable', 'string', 'max:500'],
        ]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'report', 5, 3600)) {
            return $limited;
        }
        try {
            $report = app(CommunityModerationService::class)->reportPost(
                Auth::user(), (int) $data['post_id'], $data['reason'], $data['details'] ?? '',
            );
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result(['ok' => true, 'report_id' => $report->id, 'status' => $report->status], 201);
    }

    private function blockPlayer(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to block a player.');
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'block', 20, 3600)) {
            return $limited;
        }
        try {
            $blocked = app(CommunityModerationService::class)->block(Auth::user(), (int) $data['user_id']);
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 422);
        }

        return $this->result(['ok' => true, 'blocked' => $blocked]);
    }

    private function unblockPlayer(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to unblock a player.');
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);

        return $this->result(['ok' => true, 'unblocked' => app(CommunityModerationService::class)->unblock(Auth::user(), (int) $data['user_id'])]);
    }

    private function moderationQueue(): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to view moderation reports.');
        abort_unless(Gate::allows('view-moderation-queue'), 403, 'Moderator access required.');

        return $this->result(['ok' => true, 'reports' => app(CommunityModerationService::class)->queue()]);
    }

    private function moderationResolve(Request $request): JsonResponse
    {
        abort_unless(Auth::check(), 401, 'Sign in to resolve moderation reports.');
        abort_unless(Gate::allows('resolve-moderation-reports'), 403, 'Moderator access required.');
        $data = $request->validate([
            'report_id' => ['required', 'integer', 'exists:community_reports,id'],
            'decision' => ['required', Rule::in(['dismiss', 'hide_post', 'restore_post'])],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        if ($limited = $this->limitCommunityAction(Auth::user(), 'moderation', 60, 3600)) {
            return $limited;
        }
        try {
            $result = app(CommunityModerationService::class)->resolve(
                Auth::user(), (int) $data['report_id'], $data['decision'], $data['note'] ?? '',
            );
        } catch (DomainException $exception) {
            return $this->result(['ok' => false, 'error' => $exception->getMessage()], 409);
        }

        return $this->result(['ok' => true, ...$result]);
    }

    private function limitCommunityAction(User $user, string $action, int $maximum, int $decaySeconds): ?JsonResponse
    {
        $key = "community:{$action}:{$user->id}";
        if (RateLimiter::tooManyAttempts($key, $maximum)) {
            return $this->result([
                'ok' => false,
                'error' => 'Community action limit reached. Try again later.',
                'retry_after' => RateLimiter::availableIn($key),
            ], 429);
        }
        RateLimiter::hit($key, $decaySeconds);

        return null;
    }

    private function usersBlockedFromEachOther(int $firstUserId, int $secondUserId): bool
    {
        return DB::table('community_blocks')->where(function ($query) use ($firstUserId, $secondUserId) {
            $query->where('blocker_id', $firstUserId)->where('blocked_id', $secondUserId);
        })->orWhere(function ($query) use ($firstUserId, $secondUserId) {
            $query->where('blocker_id', $secondUserId)->where('blocked_id', $firstUserId);
        })->exists();
    }
}
