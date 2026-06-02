#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT/worldsmith-server"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║     WorldSmith - AI Agent Platform           ║"
echo "  ║     One-Click Launcher                       ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

echo "[1/3] Checking dependencies..."
if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo "      Installing worldsmith-server dependencies..."
    cd "$SERVER_DIR"
    npm install
fi

echo "[2/3] Starting worldsmith-server (WebSocket PTY proxy)..."
cd "$SERVER_DIR"
npm run dev &
SERVER_PID=$!
echo "      Server PID: $SERVER_PID"
echo "      Server starting on http://localhost:3100"
echo "      WebSocket: ws://localhost:3100/ws"
echo ""

sleep 3

echo "[3/3] Starting WorldSmith web application..."
cd "$ROOT"
npm run dev

echo ""
echo "WorldSmith has been shut down."
kill $SERVER_PID 2>/dev/null || true
