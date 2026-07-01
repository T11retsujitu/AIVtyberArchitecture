# 13 — LLM Provider（NIM 配線とモデル比較）

> 状態：✅ 実装（`createNimLlmClient` + 比較ベンチ）。規範は本 doc。契約（`docs/09` の `LlmClient`）は**一切変更しない**。

`docs/09` が定めた `LlmClient`（構造化出力を強制して `AgentResponse` を返す・不変条件#3）の**具体プロバイダ実装**を定義する。
現在の実体は **NVIDIA NIM**（OpenAI 互換エンドポイント）。差し替え点は 1 つ——ループ・ゲーム・perception・response は触らない（不変条件#4）。

---

## 1. 立ち位置

```
runAgentLoop（docs/09・不変）
  └─ deps.llm: LlmClient        ← ここに差す唯一の口
        ├ createMockLlmClient() … 決定論の足場（テスト・CI。鍵不要）
        └ createNimLlmClient(cfg) … 本物。NIM で speech/observation/action を生成  ← 本doc
```

`LlmClient.complete(messages, schema)` の契約（`packages/core/src/agent/types.ts`）だけを満たす。**形が壊れた応答は client 内で例外**にし、語彙外 action は従来どおり `action-validator` が扱う（責務境界は `docs/09`）。

## 2. NIM 接続

- NIM は **OpenAI 互換**。`POST {baseUrl}/chat/completions` に `messages` をそのまま投げる。
- **鍵/URL の局所化点**は client だけ（`docs/09`：ループ本体は鍵を知らない）。`.env`：

  | 変数 | 既定 | 用途 |
  |---|---|---|
  | `NVIDIA_API_KEY` | （必須） | `nvapi-...` |
  | `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | 自前 NIM デプロイに向け替え可 |
  | `NIM_MODEL` | （demo 用・必須） | 1 本回すときのモデル id |
  | `NIM_MODELS` | （bench 用） | 比較するモデル id をカンマ区切り |
  | `NIM_TEMPERATURE` | `0.8` | キャラの揺らぎ（`docs/00 §3-3`「眠さでズレる」） |
  | `NIM_STRUCTURED_OUTPUT` | `guided_json` | `guided_json` / `json_schema` |
  | `DREAM_LLM` | `mock` | `demo.ts` の client 選択（`nim` で本物） |

- core は `@types/node` を持たない（`fetch` は DOM lib 由来）。よって **`createNimLlmClient(config)` は env を読まない**。env→config の変換は `packages/games/praise-room/src/nim-env.ts`（`@types/node` あり）に置く。

## 3. 構造化出力の強制（不変条件#3）

NIM は JSON schema 強制を 2 経路サポートする。既定は `guided_json`：

- **`guided_json`（既定・NVIDIA 推奨）**：`body.nvext.guided_json = agentResponseJsonSchema`。vLLM の guided decoding。NIM ホストモデルで最も広く通る。
- **`json_schema`（OpenAI 流）**：`body.response_format = { type:'json_schema', json_schema:{ name, schema, strict:true } }`。

いずれも渡すのは `agentResponseJsonSchema`（`response-schema.ts`。`additionalProperties:false`・全 required なので strict 可）。
どちらもモデル依存で通り方に差があるため **config で切替可能**にし、比較で確かめる。

> **実測メモ（2026-07 / integrate.api.nvidia.com の qwen3 系）**：`guided_json` は黙って無視され、`json_schema` は HTTP 500、`json_object` は推論モデル（qwen3.5-122b）で 0 トークンになる——つまり**サーバ側の構造化強制は当てにできない**。よって JSON 準拠は **prompt（`prompt-builder.ts`）が明示的に JSON オブジェクトを要求する**ことで担保し、`nvext.guided_json` は無害な no-op として残す。**不変条件#3 の実効ゲートは下記の返却フローの `AgentResponseSchema.parse`**（形が壊れていれば throw→再試行）。

返却フロー：`content` 取得 → コードフェンス除去して `JSON.parse` → **`AgentResponseSchema.parse`（zod）** → 壊れていれば throw。
transient（ネットワーク / 429 / 5xx / 素の malformed）は client 内で `maxRetries`（既定 2）だけ再試行 → なお駄目なら throw（＝その take は失敗。`docs/12 #5` の思想と一致）。**語彙外 action の reask はここではしない**（validator の責務・`docs/09`）。

## 4. モデル比較（`bench.ts`）

日本語トーンの質はモデル選定が左右する。同一入力で横並べできるよう 2 モード：

| モード | やり方 | 見るもの |
|---|---|---|
| **A（既定・固定入力）** | 決定論モックで perception 列を 1 本作り、その**同じ場面**に各モデルの `complete()` を当てて `speech`/`observation` を横並べ | 言語の質を純粋比較 |
| **B（フルtake）** | 各モデルに実際にプレイさせ `takes/<model>-seedN.json` を書き出す → Tier A ビューアで通し目視 | 行動選択込みの“作品”差（`docs/00`：行動もキャラ表現） |

```bash
# A: 同じ perception 列に対する各モデルのセリフを比較（report は takes/bench-A-seedN.json）
NIM_MODELS="qwen/qwen2.5-72b-instruct,meta/llama-3.3-70b-instruct" \
  node packages/games/praise-room/dist/bench.js A 42

# B: 各モデルの take を書き出してビューアで見る
NIM_MODELS="qwen/qwen2.5-72b-instruct,meta/llama-3.3-70b-instruct" \
  node packages/games/praise-room/dist/bench.js B 42
```

比較の初期候補：**Qwen 系**（日本語筆頭）／**Llama-3.3-70b**／**Nemotron**。結論が出たら `NIM_MODEL` を主軸に固定する。

## 5. provenance と決定論

- 実 LLM 導入で `docs/09` の「同 seed→同 trace」厳密決定論は崩れる（temperature 由来）。想定内——**Mode B+ が複数 take → 人間選定**でこのゆらぎを吸収する。
- `trace.provenance.model` に `{ provider:'nim', name:<model>, params:{ temperature } }` を残し、どのモデル/設定で撮れた take か後段（ArtifactManifest・`docs/11 §5b`）まで追える。
- provenance は決定論の対象外（依存注入・`docs/12 B`）。play-content で比較するときは provenance を除く。

## 6. 非目標

- 契約・perception・response の形変更（不変条件#4）。新しい action / field は足さない。
- 音声・録画・アップロード（別 wave・`docs/11`）。本 wave は**セリフ生成を本物にする**一点に閉じる。
- 依存の肥大：OpenAI SDK を足さず**素の `fetch`**（テストは fetch 注入で網羅・ネット不要）。

## 7. 不変条件チェックリスト

1. client は `agentResponseJsonSchema` で構造化強制し、返す前に `AgentResponseSchema.parse` を通す（#3）。
2. 鍵/URL は client（＋ `nim-env.ts`）だけが参照。ループ・ゲームは知らない（`docs/09`）。
3. 契約・perception・response の形を変更していない。差分は `agent/llm/` と praise-room の script に閉じる（#4）。
4. `speech` にメカニクス語・技術用語を出さないのは prompt（`docs/00`）の責務。provider は形だけを保証する（#5）。

## 完了ゲートとの関係

本 doc + `docs/09` を読めば、**他の人が provider を差し替え**（別 NIM モデル、あるいは別プロバイダ）でき、`bench.js` で日本語トーンを比較して主軸モデルを選べること。
