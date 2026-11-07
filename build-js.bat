@echo off
setlocal
pushd "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Install Node.js, then try again.
  set "BUILD_EXIT=1"
  goto finish
)

if not exist "node_modules\vite\bin\vite.js" (
  echo ERROR: JavaScript dependencies are missing. Run npm ci first.
  set "BUILD_EXIT=1"
  goto finish
)

echo Building Scrapbound JavaScript and CSS for production...
call npm run build
if errorlevel 1 (
  echo ERROR: Vite build failed.
  set "BUILD_EXIT=1"
  goto finish
)

if not exist "public\build\manifest.json" (
  echo ERROR: Build finished without public\build\manifest.json.
  set "BUILD_EXIT=1"
  goto finish
)

echo.
echo Build complete. Refresh the game with Ctrl+F5 to load the updated assets.
set "BUILD_EXIT=0"

:finish
popd
if not "%BUILD_EXIT%"=="0" pause
exit /b %BUILD_EXIT%
