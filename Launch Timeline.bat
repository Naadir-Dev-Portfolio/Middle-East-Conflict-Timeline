@echo off
setlocal
title Middle East Conflict Timeline
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is required to run this local app.
  echo Install Node.js 22.13 or newer, then double-click this file again.
  echo.
  pause
  exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<22 || (major===22 && minor<13)) process.exit(1)"
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Please update Node.js and try again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Installing the local app dependencies for the first launch...
  call npm ci
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm run validate:data
if errorlevel 1 (
  echo The timeline data needs attention. Read the validation message above.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-when-ready.ps1" -OpenIfReady
if not errorlevel 1 exit /b 0

echo.
echo Starting the timeline at http://localhost:3000/
echo Keep this window open while using the app. Close it to stop the app.
echo.

start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-when-ready.ps1"
call npm run dev -- --host localhost

echo.
echo The local server has stopped.
pause
