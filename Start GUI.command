#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Start GUI.command
#
# Double-click this file on macOS to launch the pdf2md-compliance GUI.
#
# What it does:
#   1. Changes into the directory where this script lives (the repo root).
#   2. Runs `npm install` to ensure all dependencies are present.
#   3. Starts the local web server with `npm run gui`.
#      The browser opens automatically at http://localhost:3000
#
# To stop the server: press Ctrl+C in the Terminal window that opens.
# ─────────────────────────────────────────────────────────────────────────────

# Move to the repo root (same folder as this script)
cd "$(dirname "$0")"

echo ""
echo "================================================"
echo "  pdf2md-compliance GUI Launcher"
echo "================================================"
echo ""

# Check Node.js is available
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed or not in PATH."
  echo ""
  echo "Please install Node.js v22 or later from https://nodejs.org"
  echo "or via nvm:  nvm install 22 && nvm use 22"
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.version)")
echo "Node.js: $NODE_VERSION"
echo ""

# Install / update dependencies if needed
echo "Checking dependencies..."
npm install --silent
echo ""

# Launch the GUI server (browser opens automatically)
echo "Starting GUI server..."
echo ""
npm run gui

# Keep terminal open if server exits unexpectedly
echo ""
read -p "Server stopped. Press Enter to close..."
