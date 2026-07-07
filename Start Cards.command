#!/bin/bash
# Double-click me to start your cards.
cd "$(dirname "$0")"

# Find node in the usual install spots
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js isn't installed yet."
  echo "  1. Go to https://nodejs.org and download the LTS version"
  echo "  2. Run that installer"
  echo "  3. Double-click 'Start Cards' again"
  echo ""
  read -n 1 -s -r -p "  Press any key to close… "
  exit 1
fi

echo ""
echo "  Your cards are running."
echo "  Keep this window open (minimize it is fine)."
echo "  To stop: close this window."
echo ""

# Open the browser once the server is up
( sleep 1; open "http://localhost:4321" ) &

exec node server.js
