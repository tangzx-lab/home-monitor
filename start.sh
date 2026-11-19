#!/bin/sh
# Start from this script's directory, even when called from elsewhere.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 18+ (current LTS recommended): https://nodejs.org/" >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  echo "Node.js 18 or newer is required. Please update Node.js." >&2
  exit 1
fi
if [ ! -f front/server.mjs ]; then
  echo "Missing front/server.mjs. Keep this script in the project root." >&2
  exit 1
fi

PORT=${PORT:-5173}
export PORT
if ! node -e 'const p = Number(process.env.PORT); process.exit(Number.isInteger(p) && p >= 1 && p <= 65535 ? 0 : 1)'; then
  echo "PORT must be an integer from 1 to 65535." >&2
  exit 1
fi

echo "Starting the home monitor service. Press Ctrl+C to stop."
echo "Open the URL printed by the server in Chrome or Edge for USB serial."
echo "If EADDRINUSE appears, the port is occupied. Example: PORT=5174 sh start.sh"
exec node front/server.mjs
