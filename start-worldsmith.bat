@echo off
chcp 65001 >nul 2>&1
title WorldSmith - AI Agent Development Environment

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║     WorldSmith - AI Agent Platform           ║
echo  ║     One-Click Launcher                       ║
echo  ╚══════════════════════════════════════════════╝
echo.

set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%worldsmith-server"
set "AGENT_DIR=%ROOT%worldsmith-agent"

echo [1/3] Checking dependencies...
if not exist "%SERVER_DIR%\node_modules" (
    echo       Installing worldsmith-server dependencies...
    cd /d "%SERVER_DIR%"
    call npm install
    if errorlevel 1 (
        echo       ERROR: Failed to install server dependencies
        pause
        exit /b 1
    )
)

echo [2/3] Starting worldsmith-server (WebSocket PTY proxy)...
cd /d "%SERVER_DIR%"
start "WorldSmith Server" cmd /c "npm run dev"
timeout /t 3 /nobreak >nul

echo       Server starting on http://localhost:3100
echo       WebSocket: ws://localhost:3100/ws
echo.

echo [3/3] Starting WorldSmith web application...
cd /d "%ROOT%"
call npm run dev

echo.
echo WorldSmith has been shut down.
pause
