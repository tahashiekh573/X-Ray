@echo off
rem  X-Ray Mirror Pro launcher - type "x-ray" in any terminal.
rem    x-ray        fast production mode (one server, optimised build)  -> http://127.0.0.1:8000
rem    x-ray dev    developer mode with hot reload                      -> http://localhost:5173
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo   X-Ray Mirror Pro - starting...
echo.

rem --- First-run setup ---
if not exist "web\node_modules" (
  echo   Installing frontend packages, first run only...
  pushd web & call npm install & popd
)
if not exist "web\public\mediapipe\models\pose_landmarker_lite.task" (
  echo   Downloading tracking models, first run only...
  pushd web & call npm run setup:mediapipe & popd
)
if not exist ".venv\Scripts\python.exe" (
  echo   Creating Python environment, first run only...
  python -m venv .venv && .venv\Scripts\python.exe -m pip install -q -e ".[dev]"
)

if /i "%~1"=="dev" goto dev

rem --- Fast mode: build (only when sources changed) and serve everything from one server ---
pushd web
node -e "const fs=require('fs'),p=require('path');const t=f=>{try{return fs.statSync(f).mtimeMs}catch{return 0}};const walk=d=>fs.readdirSync(d,{withFileTypes:true}).reduce((m,e)=>Math.max(m,e.isDirectory()?walk(p.join(d,e.name)):t(p.join(d,e.name))),0);const src=Math.max(walk('src'),walk('public'),t('index.html'),t('vite.config.ts'),t('../data/anatomy_content.json'));process.exit(t('dist/index.html')>=src?0:1)"
if errorlevel 1 (
  echo   Building optimised app, takes about 20 seconds when code changed...
  call npm run build
  if errorlevel 1 ( popd & echo   Build failed. & exit /b 1 )
)
popd
echo   Opening http://127.0.0.1:8000  (close this window or press Ctrl+C to stop)
echo.
start "" http://127.0.0.1:8000
"%ROOT%.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
goto end

:dev
start "X-Ray API" /min "%ROOT%.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
echo   Developer mode: http://localhost:5173  (close this window to stop)
pushd web
call npm run dev -- --open
popd

:end
endlocal
