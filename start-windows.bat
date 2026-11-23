@echo off
setlocal
cd /d "%~dp0"

echo Starting Stepframe...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js v20.19+ or v22.12+ is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo Building Stepframe...
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

node server\local\server.mjs
pause
