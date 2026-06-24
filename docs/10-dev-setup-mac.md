# 10 — 開発環境セットアップ（macOS）

このリポジトリは **macOS（Apple Silicon / Intel どちらも可）** での開発を想定する。
コード自体は純粋な Node/TypeScript で OS 非依存だが、hook は bash、改行は LF 固定、CI は Linux
（`ubuntu-latest`）。ローカル開発は macOS、クラウド実行は Linux コンテナ、という二本立てが前提。

> Windows は一級サポートではない。動かす場合は WSL2 / Git Bash 上で（bash hook と LF 前提のため）。

---

## 必要なもの（prerequisites）

| ツール | 推奨バージョン | 用途 | 必須/任意 |
|---|---|---|---|
| **Node.js** | 20 LTS（CI と一致。22 でも可） | 実行・ビルド・テスト | 必須 |
| **pnpm** | **9.12.0**（`packageManager` で固定） | ワークスペース管理 | 必須 |
| **Git** | 最新 | バージョン管理 | 必須 |
| **Git LFS** | 最新 | `.gitattributes` の大容量素材（webm/wav/mp4/png/psd/onnx/safetensors） | 推奨 |
| **Anthropic API キー** | — | 実 LLM で take を回す（次Wave） | 次Wave |
| **Style-Bert-VITS2** | — | 音声合成サーバ（`voice/`・次Wave） | 次Wave |

- Node は `engines.node >= 20`。**CI は Node 20** なので、ローカルも 20 LTS に合わせると差異が出にくい。
- pnpm は `package.json` の `"packageManager": "pnpm@9.12.0"` で固定。**corepack でこのバージョンに自動追従**させるのが楽。

---

## セットアップ手順

### 1. Homebrew（未導入なら）

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Node.js 20 と Git / Git LFS

バージョン管理したいなら **fnm**（or nvm / Volta）経由を推奨：

```sh
brew install fnm git git-lfs
fnm install 20
fnm use 20
git lfs install      # LFS フックを 1 度だけ有効化
```

Homebrew で直接入れてもよい：`brew install node@20`。

### 3. pnpm（corepack で固定）

```sh
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

リポジトリ内で `pnpm` を叩けば、`packageManager` 指定の 9.12.0 が使われる。
（corepack を使わない場合は `npm i -g pnpm@9.12.0` でも可。）

### 4. クローンと依存インストール

```sh
git clone <repo-url> AIVtyberArchitecture
cd AIVtyberArchitecture
pnpm install
```

### 5. 動作確認（ここまでで完結。API キー不要）

```sh
pnpm typecheck     # 全パッケージ型チェック
pnpm test          # vitest（core + games。決定論・契約・不変条件#1 ガード）
pnpm build         # dist 生成（tsconfig.build.json／テストは dist に含めない）
```

3 つとも緑なら準備完了。CI（`.github/workflows/ci.yml`）と同じ並び。

### 6. デモ take を回す（鍵不要・決定論モック）

```sh
pnpm build
node packages/games/praise-room/dist/demo.js 0    # seed を変えると入りが変わる
```

`perceive → llm(mock) → apply` の縦 1 本が走り、AIちゃんの観察と選択が表示される。

---

## .env の準備（次Wave 以降）

現状の contract / agent ループは **`.env` を読まない**（モック LLM で完結）。
次Wave で実 LLM・音声を使うときに備え、雛形だけ用意しておく：

```sh
cp .env.example .env
```

| 変数 | いつ使う | 備考 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 実 LLM で take を回す（次Wave） | キーはコミットしない（`.env` は `.gitignore` 済み） |
| `SBV2_BASE_URL` | 音声合成（`voice/`・次Wave） | 既定 `http://127.0.0.1:5000`。Style-Bert-VITS2 をローカル常駐させる |
| `DREAM_SEED` / `DREAM_TAKE_OUT_DIR` | take 実行・出力先 | 成果物（`takes/`）は LFS 管理 or 除外 |

---

## macOS 固有の注意

- **改行は LF**：`.gitattributes` が `*.ts/*.md/*.json/*.yaml` を `eol=lf` 固定。エディタを LF に設定しておく（VS Code は `"files.eol": "\n"`）。
- **Apple Silicon**：ネイティブ依存は無いので Rosetta 不要。Node/pnpm の arm64 ビルドでそのまま動く。
- **SessionStart hook**：`.claude/hooks/session-start.sh` は bash 前提（macOS 標準シェルが zsh でも `#!/bin/bash` で実行されるので問題なし）。

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `pnpm install --frozen-lockfile` が CI で失敗 | ローカルで `pnpm install` し直し、`pnpm-lock.yaml` をコミット |
| pnpm のバージョン不一致警告 | `corepack prepare pnpm@9.12.0 --activate` で固定 |
| `tsc` が node の型を見つけられない（demo/test） | `pnpm install` で `@types/node` が入っているか確認 |
| LFS 素材が中身ゼロ（ポインタのまま） | `git lfs install` 後に `git lfs pull` |
| Node 18 以下で vitest が動かない | Node 20 LTS に上げる（`fnm use 20`） |

---

## 関連

- ルート方針：`CLAUDE.md` / `AGENTS.md`
- 何を作っているか：`docs/README.md`
- 縦 1 本の実体：`packages/games/praise-room/`（`docs/02` `docs/07` `docs/09` 準拠）
