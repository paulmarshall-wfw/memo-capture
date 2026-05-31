#!/bin/zsh
set -euo pipefail

ROOT="/Users/paulmarshall/Software Development/memo-capture"
NODE_BIN="${MEMO_CAPTURE_NODE_BIN:-/Users/paulmarshall/.nvm/versions/node/v22.14.0/bin/node}"

exec "$NODE_BIN" "$ROOT/scripts/applauncher-native-dev.mjs"
