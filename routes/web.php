<?php

use App\Http\Controllers\ScrapboundController;
use Illuminate\Support\Facades\Route;

Route::view('/', 'game')->name('home');
Route::get('/api.php', [ScrapboundController::class, 'dispatch']);
Route::post('/api.php', [ScrapboundController::class, 'dispatch']);
Route::get('/{path?}', fn () => view('game'))
    ->where('path', '.*')
    ->name('game.route');
