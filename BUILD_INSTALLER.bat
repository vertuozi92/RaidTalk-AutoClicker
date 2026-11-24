@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo   RAIDTALK AUTOCLICKER - BUILD INSTALLER
echo ==========================================
where node >nul 2>nul || (echo Node.js LTS is not installed.& pause & exit /b 1)
where npm >nul 2>nul || (echo npm is not available.& pause & exit /b 1)
echo Installing dependencies...
call npm install
if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
echo Building Windows x64 installer...
call npm run dist
if errorlevel 1 (echo Build failed.& pause & exit /b 1)
echo.
echo Installer created in the release folder.
pause
