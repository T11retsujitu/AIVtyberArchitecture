# 10-setup — 開発環境セットアップ（WSL含む）

このプロジェクトを clone してから `pnpm test` が緑になるまでの手順。
**Linux / macOS / WSL2** を一次対象とする。ネイティブ Windows（非WSL）は非推奨。

前提となるツールチェーン（CI と同一に揃えること → `.github/workflows/ci.yml`）:

| ツール | バージョン | 備考 |
|---|---|---|
| Node.js | `>=20`（CI は 20） | `package.json` の `engines` |
| pnpm | `9.12.0` | `packageManager` ピン。Corepack 経由が安全 |
| git | 任意 | LFS 必須（下記） |
| git-lfs | 任意 | `.gitattributes` がバイナリ素材を LFS 追跡 |

---

## 共通手順（Linux / macOS / WSL2 内）

```bash
# 1. Corepack で pnpm を package.json ピンに合わせる（npm i -g pnpm より確実）
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 2. clone（WSL は必ず Linux 側に置く。理由は後述）
git clone <repo-url> AIVtyberArchitecture
cd AIVtyberArchitecture

# 3. LFS 素材を取得（.webm/.wav/.mp4/.png/.onnx/.safetensors 等）
git lfs install
git lfs pull

# 4. 依存をロックファイル厳密で入れる（CI と同じ）
pnpm install --frozen-lockfile

# 5. 緑を確認（型 → テスト → ビルド）
pnpm typecheck
pnpm test
pnpm build
```

### take（縦1本）を回す

```bash
# 鍵不要・決定論モック LLM で perceive→llm→apply を1本流す
node packages/games/praise-room/dist/demo.js 42   # 42 はseed。pnpm build 後に実行
```

### 環境変数

`.env.example` を `.env` にコピーして埋める。Phase 0 の契約コードは未参照だが、
次Wave（LLM 実呼び出し・音声）で使う。

```bash
cp .env.example .env
```

| 変数 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | LLM（次Wave） |
| `SBV2_BASE_URL` | Style-Bert-VITS2 等の音声合成サーバ（既定 `http://127.0.0.1:5000`） |
| `DREAM_SEED` / `DREAM_TAKE_OUT_DIR` | take 実行のseed・出力先 |

---

## WSL2（Windows + Linux）固有のセットアップ

Windows 上では **WSL2 + Ubuntu** を使う。PowerShell や Git Bash から直接動かさない
（行末・パス・ファイル監視で必ず詰まる）。

### 1. WSL2 と Ubuntu を入れる

管理者 PowerShell で:

```powershell
wsl --install -d Ubuntu
wsl --set-default-version 2
wsl --update
```

再起動後、Ubuntu を一度起動して Linux ユーザを作成する。以降の作業は**すべて Ubuntu シェルの中**で行う。

### 2. リポジトリは必ず Linux ファイルシステムに置く

`/mnt/c/...`（Windows ドライブ）に clone してはいけない。理由:

- `node_modules` の I/O が桁違いに遅い（pnpm install / vitest が極端に重くなる）
- `vitest --watch` の inotify ファイル監視が `/mnt/c` 上では効かない／取りこぼす
- パーミッション・実行ビットが正しく扱われない

正しい置き場所は Linux ホーム配下:

```bash
mkdir -p ~/src && cd ~/src
git clone <repo-url> AIVtyberArchitecture
cd AIVtyberArchitecture
```

> VS Code から触る場合は拡張機能 **WSL** を入れ、`code .` で「WSL: Ubuntu」ウィンドウとして開く。
> Windows 側の VS Code から `\\wsl$\...` を直接編集するより安定する。

### 3. Ubuntu 内のツールを入れる

```bash
# Node 20（nvm 経由が手軽。apt の nodejs は古いことがある）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# シェルを開き直してから:
nvm install 20 && nvm use 20

# pnpm は Corepack で固定
corepack enable && corepack prepare pnpm@9.12.0 --activate

# git-lfs
sudo apt-get update && sudo apt-get install -y git-lfs
git lfs install
```

この後は[共通手順](#共通手順linux--macos--wsl2-内)の 2〜5 をそのまま実行する。

### 4. 行末（CRLF/LF）— 触らないのが正解

`.gitattributes` で `*.ts/*.md/*.json/*.yaml` を **`eol=lf` 強制**にしている。
WSL の git に余計な自動変換をさせないこと:

```bash
git config --global core.autocrlf false
```

Windows 側のエディタで保存して CRLF が混入すると差分が壊れる。編集は WSL 側（VS Code WSL リモート）で行う。

### 5. 音声サーバ（SBV2）への到達 — WSL ↔ Windows のネットワーク

`SBV2_BASE_URL` の既定は `http://127.0.0.1:5000`。音声サーバを **Windows 側で起動**して
**WSL 内のコード**から叩く場合、`127.0.0.1` が指す先が WSL/Windows で別になる点に注意:

- **mirrored ネットワークモード**（Windows 11 + 新しめの WSL、`.wslconfig` で `networkingMode=mirrored`）なら
  WSL から `127.0.0.1:5000` でそのまま Windows のサーバに届く。
- それ以外（既定の NAT モード）では WSL から Windows ホストを指す必要がある:
  ```bash
  # WSL から見た Windows ホストのアドレス
  export SBV2_BASE_URL="http://$(ip route show default | awk '{print $3}'):5000"
  ```
  もしくは `cat /etc/resolv.conf` の `nameserver` を使う。
- 逆に**音声サーバも WSL 内で起動**するなら `127.0.0.1:5000` のままで一致する（最も単純。推奨）。

`.wslconfig`（Windows 側 `C:\Users\<user>\.wslconfig`）でミラーモードにする例:

```ini
[wsl2]
networkingMode=mirrored
```

変更後は `wsl --shutdown` で反映する。

### 6. よくある詰まり

| 症状 | 原因 / 対処 |
|---|---|
| `pnpm install` が異常に遅い／監視が効かない | `/mnt/c` に置いている。Linux ホーム配下へ移す |
| `pnpm` のバージョン不一致警告 | `corepack prepare pnpm@9.12.0 --activate` で固定 |
| 差分に CRLF が大量に出る | `core.autocrlf false`＋WSL 側で編集。`.gitattributes` を信頼する |
| LFS 素材が 0 バイト／ポインタのまま | `git lfs install && git lfs pull` |
| 音声サーバに繋がらない | 上記ネットワーク節。NAT モードでは `127.0.0.1` は Windows を指さない |
| `node: command not found`（新シェル） | nvm 読み込み前。シェルを開き直すか `nvm use 20` |
