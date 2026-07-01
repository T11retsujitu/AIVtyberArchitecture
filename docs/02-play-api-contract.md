# 02 — Play API Contract（DreamGame）

このドキュメントは**全ゲームが実装する契約**を定義する。`packages/core/src/play-api/contract.ts` はこの規範の TypeScript 化。食い違ったら**このdocを正**とする。

`DreamGame` は「AIちゃんが夢の中でプレイできる1本のゲーム」を表す最小インターフェース。core のエージェントループ（`runAgentLoop`）はこの契約**だけ**に依存し、個々のゲームの中身を知らない。

---

## 設計方針

- **状態は不透明（opaque）**。core はゲームの `RawState` の中身に触れない。`init` / `apply` / `perceive` / `isTerminal` を通してのみ扱う。
- **遷移は決定論的**。同じ `seed` と同じ action 列なら、常に同じ state 列・同じ perception 列になる（take の再現性と選定の前提）。
- **AIちゃんに渡るのは `perceive()` の出力だけ**（→ `docs/07`）。`apply()` の `RawState` は外に出さない。
- **action は限定列挙**（不変条件 #2）。契約上は型パラメータ `A extends string` で表し、実体は `GameMeta.actionVocabulary` が真の語彙。

---

## インターフェース

```ts
interface DreamGame<S, A extends string = string> {
  /** ゲームのメタ情報。actionVocabularyはbreaking change管理の対象 */
  readonly meta: GameMeta<A>;

  /** seedから初期状態を作る。決定論：同じseed→同じ初期状態 */
  init(seed: number): S;

  /** 生状態 → AIちゃんが見る描写。ここで座標・px・秒を必ず質に変換する（docs/07） */
  perceive(state: S): AIChanPerception;

  /** 決定論的遷移。状態を破壊変更せず、新しい状態とイベントを返す */
  apply(state: S, action: A): ApplyResult<S>;

  /** 終端判定。trueなら夢は閉じる */
  isTerminal(state: S): boolean;
}

type GameMeta<A extends string = string> = {
  /** 安定ID（"praise-room"）。ディレクトリ名と一致させる */
  id: string;
  /** 夢のタイトル（表示・字幕用） */
  title: string;
  /** 全action語彙。これが契約の核。3ゲーム実装後はbreaking change禁止（不変条件 #4） */
  actionVocabulary: readonly A[];
  /** 25秒に収まるターン上限。ループの安全弁 */
  maxTurns: number;
  /**
   * 公開用の冒頭フック（任意・人間著述）。Shorts の 0〜2 秒で「何を見る夢か」を伝える一文。
   * runAgentLoop が DreamTrace.hook へ verbatim 複写し、映像フロー（docs/11）が開幕カードに使う。
   * **perception ではない**ので AIちゃん（LLM）には渡らない。メカニクス語・技術用語を含めない
   * （不変条件 #1/#5・`assertNoRawMechanicsText` でゲート）。
   */
  hook?: string;
};

type ApplyResult<S> = {
  /** 遷移後の新しい状態（入力stateは不変） */
  state: S;
  /** このターンで起きたこと。perceive側でfeedbackの描写に変換される素材 */
  events: GameEvent[];
};

type GameEvent = {
  /** 何が起きたかの機械可読な種別（"praise.accepted" 等。ゲーム内で閉じる） */
  kind: string;
  /** 質的な含み。perceiveがfeedback.valenceへ写像する手がかり */
  valence?: 'good' | 'bad' | 'neutral' | 'strange';
};
```

> `AIChanPerception` の定義は `docs/07` / `perception/schema.ts`。この契約はそれを**参照する**だけで再定義しない。

---

## 呼び出し規約（runAgentLoop が守ること）

1. `s = game.init(seed)`
2. ループ（`turn` を 0 から `meta.maxTurns` 未満で回す）：
   a. `p = game.perceive(s)` を作り、プロンプトに乗せる
   b. LLM応答（`AgentResponse`、→ `docs/09` / `response-schema.ts`）を得る
   c. `action-validator` が `response.action ∈ p.affordances.map(a => a.action)` を検証。外れたら是正（再試行 or フォールバック）
   d. `{ state, events } = game.apply(s, action)`；`s = state`
   e. `game.isTerminal(s)` が true、または `turn` 上限で終了
3. 各ターンの `(perception, response, events)` を `trace.json` に積む

**core はこの手順だけを知る。** ゲーム固有の意味は一切持ち込まない。

---

## 実装側の不変条件

- `apply` は**純粋**（入力 `state` を変更しない、同じ入力→同じ出力）。乱数を使うなら `RawState` 内に持つ seed 由来の決定論的乱数のみ。
- `perceive(state)` は `state` を変更しない（読み取り専用）。
- `meta.actionVocabulary` に無い action が `apply` に来たら、それは validator のバグ。`apply` 側は語彙外を**例外**にしてよい（黙って無視しない）。
- `init` 以外で `seed` を参照しない（再現性のため乱数源を一元化）。

---

## breaking change ポリシー（不変条件 #4）

`DreamGame` インターフェースと `GameMeta.actionVocabulary` の**意味的破壊変更**は、**3ゲーム実装後は禁止**。
それ以前でも、変更時は全既存ゲームの `tests/state.spec.ts`（決定論テスト）を緑にしてからコミットする。

**任意フィールドの追加（additive）** は破壊変更ではないが、契約面を太らせるので **doc-first ＋ 人間承認**で行う（例：`GameMeta.hook?`）。既存ゲーム・既存 `AgentResponse` を一切変えないこと、対応する doc（本 doc / docs/09 / docs/11）を先に更新することを条件に許容する。

## 完了ゲートとの関係

このdoc + `docs/07` + `docs/00` を読めば、`praise-room` の `game.ts` / `perception.ts` / `apply-action.ts` を他の人が独立に書ける——それがPhase 0の完了条件。
