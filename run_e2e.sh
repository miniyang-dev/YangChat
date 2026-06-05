#!/bin/bash
# E2E test runner — 從 .env 讀取帳密
set -a
source "$(dirname "$0")/.env"
set +a

cd "$(dirname "$0")/frontend"
exec npx playwright test "$@"
