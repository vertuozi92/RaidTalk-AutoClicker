@echo off
setlocal
title RaidTalk AutoClicker
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS not found. Opening official download page...
  start "" "https://nodejs.org/en/download"
  echo Install Node.js LTS and run START.bat again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js LTS with npm enabled.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing Electron and dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Try: npm approve-scripts electron
    echo Then run: npm install
    pause
    exit /b 1
  )
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron is missing. Run: npm approve-scripts electron
  echo Then run: npm install
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
endlocal
