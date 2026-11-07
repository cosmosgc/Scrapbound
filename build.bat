@echo off
setlocal
pushd "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Install Node.js, then try again.
  set "BUILD_EXIT=1"
  goto finish
)

where composer >nul 2>nul
if errorlevel 1 (
  echo ERROR: Composer was not found. Install Composer, then try again.
  set "BUILD_EXIT=1"
  goto finish
)

if not exist ".env" (
  echo ERROR: .env is missing. Copy .env.example to .env and run php artisan key:generate.
  set "BUILD_EXIT=1"
  goto finish
)

echo Installing Laravel dependencies...
call composer install --no-interaction --prefer-dist
if errorlevel 1 (
  echo ERROR: Composer dependency installation failed.
  set "BUILD_EXIT=1"
  goto finish
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    set "BUILD_EXIT=1"
    goto finish
  )
)

echo Building Scrapbound for production...
set "SCRAPBOUND_BASE=/Jumper%%20Robotica/Scrapbound/"
call npm run build
if errorlevel 1 (
  echo ERROR: Build failed.
  set "BUILD_EXIT=1"
  goto finish
)

if not exist "public\build\manifest.json" (
  echo ERROR: Build finished without public\build\manifest.json.
  set "BUILD_EXIT=1"
  goto finish
)

if exist "C:\Wemp\nginx\nginx.exe" (
  echo Checking Wemp Nginx configuration...
  "C:\Wemp\nginx\nginx.exe" -t -p C:/Wemp/nginx/ -c conf/nginx.conf
  if errorlevel 1 (
    echo ERROR: Nginx configuration test failed. Build exists in dist, but was not reloaded.
    set "BUILD_EXIT=1"
    goto finish
  )
  echo Reloading Wemp Nginx...
  "C:\Wemp\nginx\nginx.exe" -s reload -p C:/Wemp/nginx/ -c conf/nginx.conf
  if errorlevel 1 echo WARNING: Nginx did not reload. The build is ready in dist; start Nginx or reload it manually.
) else (
  echo WARNING: Wemp Nginx was not found. Build is ready in dist but was not deployed.
)

echo.
echo Build complete for http://localhost:3000/Jumper%%20Robotica/Scrapbound/
echo Laravel serves the app from public\index.php.
set "BUILD_EXIT=0"

:finish
popd
if not "%BUILD_EXIT%"=="0" pause
exit /b %BUILD_EXIT%
