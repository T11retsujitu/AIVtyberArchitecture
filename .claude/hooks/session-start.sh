#!/bin/bash
# SessionStart hook — Claude Code on the web 用の依存セットアップ。
# 毎回まっさらなコンテナで pnpm install を済ませ、typecheck / test / build が
# すぐ走る状態にする。冪等・非対話。
set -euo pipefail

# リモート（web）セッション以外では何もしない（ローカルは各自の環境に任せる）
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# corepack 経由で package.json 記載の pnpm を使う（無ければ素の pnpm にフォールバック）
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

pnpm install --frozen-lockfile
