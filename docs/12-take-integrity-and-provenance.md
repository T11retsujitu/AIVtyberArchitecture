# 12 — 提案：Take Integrity & Provenance（レビュー #5 / #3）

> 状態：**A（#5）＝承認・実装済み（2026-07-01）**、**B（#3）＝承認・実装済み（2026-07-01）**。
> どちらも docs（09/11）反映済み・core 実装済み・テスト緑。本 doc は不変条件 #4 に該当する契約変更（`EndReason`／`ResolveOutcome`／`DreamTrace` 拡張）を含み、人間承認の上で実装した。
> 残タスクは B-4（`tokenUsage`/`cost` のための `LlmClient` 契約拡張）で、本番 LLM クライアント実装 Wave まで後回し。

対象は 2026-07-01 の ChatGPT レビューの P0 のうち、契約変更を伴う 2 件（[[chatgpt-review-response-plan]]）：
- **#5** フォールバック時に speech と action が食い違う → take を失敗扱いにする
- **#3** `DreamTrace` だけでは動画の再現に足りない → 素性（provenance）を残す

以下は**推奨案つきの提案**。各節末の「決定点」を承認 or 変更指示してください。

---

## A. Take Integrity（#5）— 語彙外は救済せず take を失敗にする

### 現状と問題
`action-validator.ts` は再試行（既定 2）を使い切ると `affordances[0]` にフォールバックし、**speech は無効応答のまま action だけ差し替える**（`finalResponse: { ...current, action: fallback }`）。結果、
```
speech: 「少し離れてみる……」   action: look（見つめる）
```
のような**セリフと行動の食い違い**が起こる。ショート動画では致命的（視聴者に嘘の因果が見える）。

### 提案（推奨）
再試行を使い切ったら**フォールバックせず take を失敗として閉じる**。Mode B+ は複数 take を撮るので、壊れた 1 本は捨てればよい（無理に救済しない）。

1. **`EndReason` に `invalidAction` を追加**（命名は既存の camelCase 流儀＝`maxTurns` に合わせる。レビュー案の `invalid-agent-response` は不採用）。
   ```ts
   type EndReason = 'terminal' | 'deadend' | 'maxTurns' | 'invalidAction';
   ```
2. **`ResolveResult` を判別可能ユニオンに**（`types.ts`）：
   ```ts
   type ResolveOutcome =
     | { ok: true;  action: string; corrected: boolean; finalResponse: AgentResponse }
     | { ok: false; reason: 'invalidAction'; attempts: number; lastResponse: AgentResponse };
   ```
3. **ループ**：`ok:false` なら `apply` せず、`endReason = 'invalidAction'` で break。失敗ターンは `trace.turns` に**積まない**（`TraceTurn` は「valid action が apply された」不変を保つ）。デバッグ用に **`DreamTrace.failure`** に最後の無効応答＋その perception を残す：
   ```ts
   type DreamTrace = {
     // …既存 …
     failure?: { reason: 'invalidAction'; turn: number; perception: AIChanPerception;
                 lastResponse: AgentResponse; attempts: number };
   };
   ```
4. **`corrected` の意味は不変**：reask で valid に直った take は `corrected: true` のまま採用（軽い劣化。捨てるのは使い切った時だけ）。

### レンダリング上の扱い
`invalidAction` の take は**描画前に捨てられる**（人間 or 自動採点で除外）。よって docs/11 の「endReason → 締めの絵」対応表に `invalidAction` のグロスは要らない（`terminal`/`deadend`/`maxTurns` は演出上の終端だが、`invalidAction` は不良品マーク）。

### 影響範囲
`core`: `agent/types.ts`・`agent/action-validator.ts`・`agent/agent-loop.ts`・`agent/trace.ts`／docs: `09`。契約 doc `02`/`07` は不変。

### 移行（テスト）
`praise-room/src/state.test.ts` の「語彙外 → フォールバックで救済」テストを**「語彙外 → `invalidAction` で失敗」**に置換：`evilLlm`（常に語彙外）run は `endReason:'invalidAction'`、`turns.length:0`、`failure` 記録を検証。

### 決定（確定・実装済み 2026-07-01）
- A-1. endReason 名 = **`invalidAction`**。
- A-2. 失敗ターンは **`DreamTrace.failure`** にだけ残す（`turns` は valid action のみ）。
- A-3. `maxRetries` = **2** のまま。

---

## B. Provenance & Manifest（#3）— 再現に足る素性を残す

### 現状と問題
`DreamTrace` は `gameId/title/seed/endReason/turns` のみ。「この take の喋り方が良かった」を後で**再現できない**（どのモデル・プロンプト版・キャラ版・音声かが残らない）。

### 設計方針：3 層に分けて考える
| 層 | 再現手段 | どこが持つ |
|---|---|---|
| **ゲーム面** | `seed` + `action` 列で決定論再生（docs/09） | 既存 `DreamTrace`（`turns` から action 列が取れる） |
| **生成の素性** | 非決定論な LLM/音声の**入力**を記録 | 追加する `DreamTrace.provenance`（ループが知る範囲） |
| **成果物** | audio/video の実ファイル | 録画wave（docs/11）の **ArtifactManifest**。ループ時点では未知なのでここに入れない |

### 提案する形
1. **`DreamTrace.provenance`（ループが知る素性だけ）**：
   ```ts
   type TraceProvenance = {
     runId: string;            // 依存注入（テストで固定可能に）
     createdAt: string;        // ISO8601。依存注入（clock）
     gameId: string; gameVersion?: string; gameCommitSha?: string;
     seed: number;
     model: { provider: string; name: string; params?: Record<string, unknown> };
     promptVersion: string;
     characterBibleVersion: string;   // docs/00 の版
     tokenUsage?: number;
     estimatedCost?: number;
   };
   ```
2. **録画wave の `ArtifactManifest`（docs/11 側に節を追加）**：`runId` で trace を参照し、`voiceModel/voiceParams/audioPaths/videoPath/最終コスト` を足す。レビューの ArtifactManifest はこの層に相当（`tracePath`/`audioPaths`/`videoPath` は下流の値）。

### 決定論との衝突（重要）
`state.test.ts` は同 seed で `expect(a).toEqual(b)`（完全一致）を要求する。`runId`/`createdAt` を素で入れると**この不変が壊れる**。解決：
- (a) **決定論テストは play-content（provenance を除いた射影）で比較**する。docs に「決定論の保証対象は `turns`/perception/state 列。`provenance` は環境依存で対象外」と明記。
- (b) **`runId`/`createdAt`/`model` は依存注入**（`opts.now?()` / `opts.runId?` あるいは `deps.clock`）でテスト時に固定可能にする。core が勝手に `Date.now()`/乱数を呼ばない（決定論の足場を守る）。
- `tokenUsage/cost` を残すには **`LlmClient.complete` の戻りに usage を足す**必要がある（今は `AgentResponse` のみ）。→ LlmClient 契約の拡張の是非が決定点。

### 影響範囲
`core`: `agent/trace.ts`・`agent/agent-loop.ts`（provenance 組み立て・clock/id 注入）・`agent/types.ts`（`RunAgentLoopOptions` か `deps` に clock/runId、LlmClient に usage）／docs: `09`・`11`。`mock-llm`・`demo` は provenance を渡すよう更新。

### 決定（確定・実装済み 2026-07-01）
- B-1. provenance を **`DreamTrace` に内包**（常に付く必須フィールド。未指定は 'unknown'）。
- B-2. `runId`/`createdAt`/`model` は **`opts.provenance` で依存注入**。core は時計/乱数を持たない。
- B-3. 版情報も **`opts.provenance` に集約**（当初案の PromptContext 経由ではなく、provenance 入力を1箇所にまとめて凝集度と決定論テスト両立を優先）。将来 prompt-builder が版を所有するようにしてもよい。
- B-4. `tokenUsage/cost` は **後回し**（`LlmClient` 契約拡張が要る。本番 LLM クライアント Wave で）。

---

## 実装順序（承認後）
1. **A を先**（小さく閉じる：`EndReason` 追加＋validator＋テスト置換）。契約の変更点が少なく、動画品質への効果が直接的。
2. **B は足場から**：clock/id 注入 → `provenance` → docs/11 に ArtifactManifest 節。usage/cost は本番 LLM クライアントの Wave で。

## 完了ゲート
- A：語彙外を使い切った take が `invalidAction` で失敗し、Mode B+ で自動的に捨てられる。**speech/action 不一致の take が生成されない**。
- B：1 本の trace から model/prompt/キャラ版/seed が判り、`seed + action` 列でゲーム面を再生できる。決定論テストは provenance を除いた射影で緑のまま。
