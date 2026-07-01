# 09 — Agent Loop Spec（runAgentLoop / AgentResponse）

このドキュメントは **core が 1 take を回すループ**を定義する。`docs/02` の「呼び出し規約」を**実装レベルまで具体化**したもの。
`agent/response-schema.ts` は本docの `AgentResponse` 節の TypeScript 化であり、食い違ったら**このdocを正**とする。`runAgentLoop` / `action-validator` / `llm-client` / `prompt-builder` / `trace` の実体は次Wave。

core はここで定義する手順「だけ」を知り、ゲーム固有の意味（`RawState` の中身）を一切持ち込まない（→ `docs/02`）。

---

## 全体像

```
game.init(seed) ─→ s
  │
  └─[ループ turn = 0,1,2,… ]────────────────────────────────┐
      p = game.perceive(s)            … 描写だけ（docs/07）  │
      ├ affordances 空？ → dead-end で終了                    │
      messages = prompt.build(p)      … docs/00 1–4節＋p     │
      r = llm.complete(messages)      … structured output強制 │
      a = validator.resolve(r.action, p.affordances)         │
      { state, events } = game.apply(s, a) ; s = state       │
      trace.push({ turn, p, r, a, events })                  │
      game.isTerminal(s) or turn上限？ → 終了 ────────────────┘
  │
  └─→ DreamTrace（take の素材。Mode B+ で人間が選定）
```

毎ターン AIちゃん（LLM）に渡るのは `AIChanPerception` だけ。`RawState` は外に出ない（不変条件 #1）。

---

## AgentResponse（LLM 出力）

LLM は毎ターン `AIChanPerception` を受け取り、次の構造で**だけ**応答する。自由文字列の混在は許さない（不変条件 #3：JSON mode / structured output で強制）。実体は `agent/response-schema.ts`。

```ts
type AgentResponse = {
  /** 内的観察メモ。生真面目さの表現。表側字幕には出さなくてよい */
  observation: string;   // min 1
  /** 発話。25秒ショートのセリフ。メカニクス語・技術用語禁止（docs/00 §2,§4） */
  speech: string;        // min 1
  /** 選択した action id。語彙妥当性は action-validator が別途検証 */
  action: string;        // min 1
};
```

| フィールド | 用途 | 表側に出るか |
|---|---|---|
| `observation` | trace に積む内的メモ。デバッグ・take 選定の手がかり | 出さなくてよい |
| `speech` | ショートのセリフ（字幕＋音声 voice/） | **出る**。docs/00 の作法に従う |
| `action` | `game.apply` に渡す行動 | 出ない（結果だけが描写で出る） |

**注意**：`action` が「今ターンの `affordances` に含まれるか」は静的スキーマでは表せない（ターン依存の限定列挙）。形の強制はここまで、**語彙の妥当性は `action-validator`** が `perception.affordances` を参照して検証する（→ 後述）。

---

## コンポーネント契約

`runAgentLoop` は次の 4 つに依存する。いずれもプロバイダ非依存・差し替え可能。

### LlmClient — 構造化出力の強制

```ts
interface LlmClient {
  /**
   * messages を投げ、AgentResponse を返す。
   * structured output / JSON mode を必ず使い、未パース文字列を返さない（不変条件 #3）。
   * 返す前に AgentResponseSchema.parse を通し、形が壊れていれば throw する。
   */
  complete(messages: ChatMessage[], schema: typeof agentResponseJsonSchema): Promise<AgentResponse>;
}
```

- 形が崩れた応答（必須欠落・余剰キー）は **LlmClient 内で例外**にする。ループ側の validator は「形は正しいが action が語彙外」だけを扱う。
- `ANTHROPIC_API_KEY` 等はここでのみ参照（`.env.example`）。ループ本体は鍵を知らない。

### PromptBuilder — キャラ＋描写の投入

```ts
interface PromptBuilder {
  /** docs/00 §1–4（または抽出版）＋ perception を messages に組む */
  build(perception: AIChanPerception, ctx: PromptContext): ChatMessage[];
}
```

- **必須投入**：`docs/00` の 1–4節（最小核は「眠そう×生真面目／メカニクス語を喋らない／affordancesから性格で選ぶ／正しさよりらしさ」。この4点は削らない）。
- `perception` は**描写のまま**渡す。`turn` を数値としてプロンプトに露出しない（局面表現＝`closure` を使う。docs/07 フィールド契約）。
- memory atom（`docs/08`・次Wave）が入るのも `ctx` 経由のここ。現状は未配線でよい。
- 出力に座標・px・秒・スコア名が混じらないこと（perception 側で既に排除済みの前提。二重には作らない）。

### ActionValidator — 語彙の妥当性と是正

```ts
interface ActionValidator {
  /**
   * response.action が affordances 内ならそれを採用（ok:true）。
   * 語彙外なら reask で有効な action 一覧を添えて再要求（既定 maxRetries=2）。
   * 使い切ってもなお語彙外なら take 失敗（ok:false / invalidAction）。フォールバックしない。
   */
  resolve(response: AgentResponse, affordances: Affordance[], reask: Reask): Promise<ResolveOutcome>;
}

type ResolveOutcome =
  | { ok: true;  action: string; corrected: boolean; finalResponse: AgentResponse }
  | { ok: false; reason: 'invalidAction'; attempts: number; lastResponse: AgentResponse };
```

検証規則（docs/02・docs/07・docs/12 と一致）：

- 正常系：`response.action ∈ affordances.map(a => a.action)` → そのまま採用（`ok:true`）。
- 語彙外：`reask` で LLM に**有効な action ラベル一覧**を添えて再要求する（既定 **2回**まで）。**直れば採用**（`ok:true`・`corrected:true`＝軽い劣化）。
- 再試行を使い切ってもなお語彙外：**take 失敗**（`ok:false`・`reason:'invalidAction'`）。フォールバックしない（#5）。ループが `endReason='invalidAction'` で閉じ、`DreamTrace.failure` に最後の無効応答を残す。その take は描画前に捨てる（Mode B+）。
- `affordances` が**空**の場合は validator を呼ばない（ループ側で dead-end として先に終了。後述）。

> `apply` に語彙外 action が届くのは「validator のバグ」（docs/02）。validator が `apply` の手前で必ず吸収するため、`apply` は語彙外を例外にしてよい。

---

## ループ仕様（runAgentLoop）

```ts
type RunAgentLoopOptions = {
  seed: number;
};

async function runAgentLoop<S, A extends string>(
  game: DreamGame<S, A>,
  deps: { llm: LlmClient; prompt: PromptBuilder; validator: ActionValidator },
  opts: RunAgentLoopOptions,
): Promise<DreamTrace>;
```

> 再試行回数（既定 2）は `RunAgentLoopOptions` ではなく **`createActionValidator(maxRetries)`** で設定する（retry は validator の責務。実体 `agent/action-validator.ts`）。ループ本体は retry 回数を知らない。

手順（`docs/02` 呼び出し規約の具体化）：

1. `s = game.init(opts.seed)`。`turn = 0`。
2. ループ（`turn < game.meta.maxTurns` の間）：
   1. `p = game.perceive(s)`。
   2. **終端の早期判定**：`p.affordances` が空なら → `endReason = 'deadend'` で**ループを抜ける**（手詰まり＝夢の終わり方の一型。docs/07）。最後の観察は、直前ターンまでに `closure: 'closing'` で既に語られている前提（docs/00 §3「最後の観察を静かに残す」）。LLM は呼ばない。
   3. `messages = prompt.build(p, ctx)`。
   4. `r = llm.complete(messages, agentResponseJsonSchema)`。
   5. `outcome = validator.resolve(r, p.affordances, reask)`。
   6. **take 失敗の判定**：`outcome.ok === false` なら → `endReason = 'invalidAction'`、`DreamTrace.failure` に `{ turn, perception: p, lastResponse, attempts }` を記録し、`apply` せず**ループを抜ける**（#5・docs/12）。
   7. `{ state, events } = game.apply(s, outcome.action)`。`s = state`。
   8. `trace.push({ turn, perception: p, response: outcome.finalResponse, action: outcome.action, corrected: outcome.corrected, events })`。
   9. `game.isTerminal(s)` が true なら → `endReason = 'terminal'` で抜ける。
   10. `turn += 1`。
3. ループが `turn === maxTurns` で尽きたら → `endReason = 'maxTurns'`。
4. `DreamTrace` を返す。

**終了条件は 4 つ**：`terminal`（ゲームが閉じた）／`deadend`（affordances 空）／`maxTurns`（安全弁）／`invalidAction`（語彙外を使い切って take 失敗・#5）。

- `closure` を `closing` にする責任は**ゲームの `perceive`** にある（残りターン感の表現）。ループは `closure` を強制しない（25秒構造の作り込みは `docs/01`）。
- `maxTurns` は 25 秒に収めるための安全弁であって、演出上の終端ではない。`maxTurns` 打ち切りが常態化するゲームは perceive/isTerminal の設計ミス。

---

## DreamTrace（take の素材）

ループの唯一の成果物。Mode B+ では 1 エピソードを複数 take 撮り、この trace を見て人間が選定する。後段（voice / overlay / recorder・次Wave）はこれだけを入力にする。

```ts
type DreamTrace = {
  gameId: string;          // game.meta.id
  title: string;           // game.meta.title
  seed: number;
  endReason: 'terminal' | 'deadend' | 'maxTurns' | 'invalidAction';
  turns: TraceTurn[];
  // endReason==='invalidAction' のときだけ付く不良 take のデバッグ素材（描画前に捨てる）
  failure?: {
    reason: 'invalidAction';
    turn: number;
    perception: AIChanPerception;
    lastResponse: AgentResponse;
    attempts: number;
  };
};

type TraceTurn = {
  turn: number;
  perception: AIChanPerception;  // そのターン AIちゃんが見たもの
  response: AgentResponse;       // 採用された最終応答（再試行後）
  action: string;                // 実際に apply へ渡した action（是正後・affordances 内）
  corrected: boolean;            // 初回 action が語彙外で是正されたか（劣化マーク）
  events: GameEvent[];           // apply が返した生イベント（feedback の元）
};
```

- `turns[i].response.speech` を順に並べると**ショートのセリフ列**になる。
- `corrected: true` を含む take は劣化候補。選定で優先的に外せる。
- `perception` を丸ごと残すのは、後で字幕・立ち絵・演出を**再構築**するため（scene.summary / elements / closure が演出の素材）。

---

## 決定論と再現性

- **ゲーム遷移は決定論**：同じ `seed` ＋同じ action 列 → 同じ state 列・同じ perception 列（docs/02・docs/07 の不変条件）。
- **ループ全体は非決定論**：LLM の出力が毎回ぶれるため、`runAgentLoop` を 2 回回せば別 take になる（これが Mode B+ で複数 take を撮る前提）。
- **再現テストの観点**：`trace.turns.map(t => t.action)` を取り出し、`init(seed)` から `apply` で順に再生すると、`trace` と同じ state 列・perception 列が出ること（`tests/state.spec.ts`・次Wave）。LLM 部分はモックして action 列だけを与える。

---

## 不変条件チェックリスト（実装時に緑にする）

1. プロンプトに渡る perception に座標・px・秒・スコア名が**生で**入っていない（#1）。
2. `apply` に渡る action は必ず `affordances` 内（validator が保証）。語彙は限定列挙（#2）。
3. LLM 応答は `agentResponseJsonSchema` で構造化強制、`AgentResponseSchema.parse` を通す（#3）。
4. `DreamGame` 契約・`AgentResponse` の形を**無断で breaking change しない**（#4。変更はこのdoc → コードの順で、人間承認）。
5. `speech` にメカニクス語・技術用語が出ない（#5。docs/00 §2,§4。lint/レビューで担保）。

## 完了ゲートとの関係

このdoc + `docs/02` + `docs/07` + `agent/response-schema.ts` を読めば、`runAgentLoop` と `action-validator` を**他の人が独立に実装でき**、`praise-room` を縦に 1 本（perceive→llm→apply）通せること。
```
