# 11 — Render Pipeline（DreamTrace → 縦型ショート）

> 状態：⬜ 次Wave（**設計ドラフト**。コード未着手。実装前にこの doc を正とする）

このドキュメントは **1 本の `DreamTrace` を 25 秒の縦型ショート（9:16）に落とす後段**（画面・音声・字幕・録画）の設計を定義する。
`docs/09` までが「AIちゃんがプレイして `DreamTrace` を作る」フローだったのに対し、ここは **`DreamTrace` を入力に取る消費者**の側。

**このwaveは `DreamGame` 契約（`docs/02`）・`AIChanPerception`（`docs/07`）・`AgentResponse`（`docs/09`）を一切変更しない。** 既存の成果物（trace）を読むだけ。

---

## 0. 立ち位置（2つのフロー）

```
[プレイのフロー：docs/09、実装済み]
  game.init(seed) → runAgentLoop（perceive→llm→apply）→ DreamTrace

[映像のフロー：この doc、これから]
  DreamTrace ─→ render（画面）─┐
              ─→ voice（音声）─┼─→ compose/overlay（字幕・立ち絵合成）─→ record（25秒 縦mp4）
              ─→ (replay)     ─┘
```

`DreamTrace` は 2 フローの**唯一の受け渡し点**。映像フローは trace 以外の内部状態に触らない（`GameMeta` も直接読まない。公開フックは `trace.hook` 経由で届く）。

**render 入力契約**：`turns.length >= 1` を要求する。`turns` が空で `closing`/`hook` だけの trace は不良品として**描画前に破棄**する（praise-room は `init` が常に affordances を持つので `turns >= 1` が保証される）。`hook`（開幕）と `closing`（締め）はどちらも任意で、`turns` の前後に足す装飾フレーム。

---

## 1. 中核原則（外せない）

1. **画面は「第二のゲーム」ではなく `DreamTrace` のビュー。** ロジックの正は `init/perceive/apply/isTerminal`（`docs/02`）だけ。レンダラは独自のゲームロジック・独自の乱数・独自の遷移を持たない。持てば正が二重化し、Perception 境界（不変条件#1）が崩れる。
2. **AIちゃんは画面（ピクセル）を見ない。** 見るのは今まで通り `perceive()` の描写だけ。画面を見るのは録画側（人間）だけ。→ 画面レイヤの追加は AIちゃんの入力に影響しない。
3. **決定論リプレイで再構築する。** 同じ `seed` + 同じ `action` 列 → 同じ state 列・同じ perception 列（`docs/09` の再現性）。だから映像は trace から**確定的に**焼ける。Mode B+ の「複数 take を撮って人間が選ぶ」が映像側でもそのまま成立する。
4. **`RawState` を trace・core・AI に漏らさない。** リッチ描画に生状態が要る場合でも、trace に RawState を積まない（不変条件#1）。必要なら**リプレイで再生**する（→ §4 Tier B）。
5. **表側にメカニクス語・技術用語を出さない**（不変条件#1,#5）。画面に座標・スコア・HP・残り秒の HUD を出さない。RAG/ベクトルDB/LLM/プロンプト等の語も一切出さない。字幕は `speech` のみ（`docs/00 §2,§4` の作法済み）。

---

## 2. 何を「入力」に描くか — perception か RawState か

これがこの wave の中心的な設計判断。**2 段構え**にする。

| 段 | 入力 | 描けるもの | 適用範囲 | 位置 |
|---|---|---|---|---|
| **Tier A（既定・汎用）** | `DreamTrace` の `perception`（＝質的フィールドのみ） | 雰囲気描画：`scene.summary` の情景、`elements` を漂わせ、`salience` で存在感、`feedback.valence` で色/エフェクト、`closure` で明度・尺感、`speech` を字幕 | **全ゲーム共通・ゲーム固有コード 0** | `packages/core`（または `packages/render`） |
| **Tier B（任意・ゲーム固有）** | リプレイで再生した `RawState` | 忠実な盤面（praise-room なら光・ぬくもり・距離の実描画） | そのゲームだけ | **ゲームパッケージ内**（`render-frame.ts` 等） |

- perception は**座標を意図的に捨てている**（`docs/07`）。だから Tier A は精密な盤面を描けない——が、これは欠点ではなく**「夢」の絵として正しい**（漂う情景・質感・気配）。まず Tier A を MVP にする。
- Tier B が要るゲームは、`perceive(state)` の**兄弟**として `renderFrame(state): Frame` をゲームパッケージに置く。RawState を触るのはゲーム自身なので境界は破れない（core も AI も RawState を受け取らない）。
- Tier B を trace から駆動するには **リプレイ**する：`s = game.init(trace.seed)`、`trace.turns.map(t => t.action)` を順に `apply` して各ターンの `RawState` を再生し、`renderFrame` に渡す。trace に RawState を積まずにリッチ描画できる（原則#4を守る）。

> 判断の既定：**まず Tier A で 1 本通す**。Tier B はゲーム表現の要求が出てから足す。

---

## 3. 画面レイヤ構成（9:16）

縦型ショート（例 1080×1920）。下から積む：

```
┌─────────────┐  ← 9:16 セーフエリア
│  背景 / 情景層   │  scene.summary の空気感（Tier A）／盤面（Tier B）
│                 │
│   要素層         │  scene.elements[].description を salience 順に配置
│   ✧  ◐  ·       │  （faint→薄/小、vivid→濃/大。座標は演出側が決める）
│                 │
│   フィードバック層 │  直前 feedback.valence を色・パーティクルで（good=暖色 等）
│                 │
│   ┌────────┐    │
│   │ AIちゃん │    │  立ち絵（眠そう×生真面目。closure で表情/まぶた）
│   └────────┘    │
│  ┌───────────┐  │
│  │  字幕：speech │  │  1〜2文（docs/00 §4）。メカニクス語・技術用語なし
│  └───────────┘  │
└─────────────┘
```

- **座標を持たない要素をどう置くか**：`elements[].ref` で同一性は保証される（ターンをまたいで同じ ref＝同じ対象）。配置は**演出側の決定**（例：ref を安定ハッシュ→定位置、salience→サイズ/不透明度）。ゲームの座標を再導入しない。
- **立ち絵の表情**は `closure`（opening/unfolding/closing）と直前 `feedback.valence` から選ぶ。専用の感情フィールドは perception に足さない（境界を太らせない）。
- **開幕フックカード（0〜2s）**：`DreamTrace.hook`（＝`GameMeta.hook` の複写・docs/02/09）があれば、本編の前に**タイトルカード**として提示し「何を見る夢か」を立てる。これは**字幕ではない**（字幕トラックは `speech` のみ・原則#5）。render 側で LLM を呼ばず、trace の hook をそのまま出すだけ。hook 自体はメカ語・技術語を含まない前提（docs/02 の `assertNoRawMechanicsText` ゲート）。
- **締めビート（Closing Beat）**：`DreamTrace.closing`（docs/09）があれば、`turns` の最後の後にもう 1 フレーム描く。情景は `closing.perception`、字幕は `closing.response.speech`。**終端グロス（閉じた/手詰まり/醒めた）は全面オーバーレイにせず**、小さなピルで出して**締めの字幕を覆わない**。内部 enum（`closure`/`endReason`）は公開面に生表示せず日本語グロスにする（#5）。
- **内部語を出さない**：`opening`/`closing`/`terminal`/`deadend`/`maxTurns` 等の内部トークンをテキスト化しない。局面・終わり方は日本語グロスで表す（Tier A ビューアもこの規則に従う）。

---

## 4. コンポーネント契約（プロバイダ非依存・差し替え可能）

`runAgentLoop` の deps（`docs/09`）と同じ思想：インターフェースだけ決め、実装は差し替える。**この doc では型の意図だけ確定**し、TS 化は実装 wave で行う。

```ts
// trace 1ターン → 1フレーム（静止画/DOM/canvas いずれの実装でもよい）
interface FrameRenderer {
  // Tier A: perception だけで描く（全ゲーム共通）
  renderTurn(perception: AIChanPerception, prev?: AIChanPerception): Frame;
}

// speech → 音声。SBV2 等。鍵/URLはここでのみ参照（.env の SBV2_BASE_URL）
interface VoiceSynth {
  speak(speech: string, style?: VoiceStyle): Promise<AudioClip>; // 長さが尺配分の素材(§5)
}

// フレーム列＋音声＋字幕を 1 本の縦mp4 に焼く
interface Recorder {
  record(scenes: TimedScene[], out: string): Promise<VideoFile>; // 9:16, ~25s
}
```

- **VoiceSynth** は `docs/09` の LlmClient と同じく鍵/URL の局所化点（`SBV2_BASE_URL`、既定 `http://127.0.0.1:5000`／WSL 到達性は `docs/10 §5`）。ループ本体・レンダラは鍵を知らない。
- **Recorder** の実装候補（実装 wave で選定）：ブラウザ描画 → ヘッドレスキャプチャ（Playwright 等）→ ffmpeg 結合、あるいは canvas 直 → ffmpeg。**まず「Web ビューアで目視 → 後からキャプチャ」**の順にすると contract を触らず絵の正しさを確認できる。
- すべて **trace → 決定論**。録画を 2 回焼けば同じ絵（voice の生成ゆらぎを除く）。

---

## 5. 25 秒尺の割り付け

> 依存：尺の「型」（25秒構造・失敗の型6種）は **`docs/01-dream-design-rules.md`** を正とし、本 doc は配分の**機構**だけ定める。両者が食い違ったら *型は01・機構は11*。

- 総尺 **~25s** は上限。総ビート数は `trace.turns.length + (trace.closing ? 1 : 0)`（＝各ターン ＋ 締めビート）。加えて開幕フックカード（`trace.hook` があれば 0〜2s）を頭に足す。
- **1 ターンの表示時間は音声長で決める**（`speech` を読み上げた `AudioClip` の長さ＋余韻）。読み上げ対象のセリフ列は**各ターン `speech` ＋ 末尾に `closing.response.speech`（あれば）**。全ビート合計が 25s を超えるなら、余韻を詰める→それでも溢れるなら**末尾ではなく中盤を間引く**（opening と closing＝`closure` の端は演出上残す）。
- 「最後の観察を静かに残す」の対象は、`closing` があれば `closing.response.speech`（夢が閉じたあとの受け止め）。無ければ最後のターンの `speech`。
- `closure` を尺のペーサに使う：`opening` はやや溜め、`unfolding` はテンポ、`closing` は間を置いて**最後の観察を静かに残す**（`docs/00 §3-4`）。
- `endReason`（`terminal`/`deadend`/`maxTurns`）で締めの絵を変える（受容/手詰まり/時間切れ）。`maxTurns` 打ち切りが常態化するなら perceive/isTerminal の設計ミス（`docs/09`）——尺側で誤魔化さない。

---

## 5b. ArtifactManifest（`trace.provenance` の下流・docs/12 B）

録画完了時に、この wave が **ArtifactManifest** を書き出す。`DreamTrace.provenance`（生成の素性・docs/09）を引き継ぎ、**下流でしか分からない値**を足す：voice モデル/パラメータ、`audioPaths`、`videoPath`、最終コスト。`runId` で trace と対応づける。

```ts
type ArtifactManifest = {
  runId: string;                 // DreamTrace.provenance.runId と一致
  trace: TraceProvenance;        // ゲーム/モデル/プロンプト/キャラ版・seed（docs/09）
  voice: { model: string; params?: Record<string, unknown> };
  audioPaths: string[];          // ターンごとの音声
  videoPath?: string;            // 最終 mp4
  tokenUsage?: number; estimatedCost?: number;
};
```

> 実装は録画 wave。ループ時点では audio/video が未確定なので `DreamTrace` には入れない（provenance だけがループの責務・docs/12 B）。`tokenUsage`/`estimatedCost` は `LlmClient` 契約の拡張が要るため後回し（docs/12 B-4）。

## 6. 非目標（この wave でやらないこと）

- `DreamGame` 契約・`AIChanPerception`・`AgentResponse` の変更（不変条件#4）。**新しい action も perception フィールドも足さない。**
  - 注：`DreamTrace.hook` / `DreamTrace.closing` は core/agent-loop wave（docs/09・02）で追加済みの **additive な trace フィールド**であり、映像 wave はそれを**読むだけ**。映像側で hook/closing を生成したり LLM を呼んだりはしない。
- trace に `RawState` を積むこと（原則#4。リッチ描画はリプレイで再生する）。
- 画面に HUD 数値・スコア・座標・残り秒を出すこと（不変条件#1,#5）。
- LLM を映像側から呼ぶこと（映像は trace の消費者。生成はプレイフローで完結済み）。

---

## 7. 不変条件チェックリスト（実装 wave で緑にする）

1. レンダラ・字幕・立ち絵に座標/px/秒/スコア名が**生で**出ていない（#1・#5）。字幕は `speech` のみ。
2. `RawState` が trace・core・レンダラ引数に現れない。Tier B はゲームパッケージ内でリプレイ再生した state だけを触る（#1）。
3. 契約・perception・response の形を変更していない（#4）。映像 wave の差分は `packages/render`（or core 追加）とゲーム内 `render-frame.ts` に閉じる。
4. 表側に技術用語（RAG・ベクトルDB・LLM・プロンプト・トークン）が出ない（#5）。
5. 同じ trace → 同じ絵（voice 生成ゆらぎを除き決定論。#再現性 docs/09）。

---

## 8. 実装の入口（この doc 確定後の最小ステップ）

1. **Tier A ビューア**：`DreamTrace`（JSON）を読み、9:16 で `scene/elements/feedback/closure` を描き `speech` を字幕表示する Web 1 枚。praise-room の trace 1 本で目視。**contract 非依存**。
2. **trace 出力**：`demo.ts` を `console.log` から `DreamTrace` の JSON 書き出しに拡張（`DREAM_TAKE_OUT_DIR`・`docs/10`）。ビューアの入力になる。
3. **voice 配線**：`speech` → SBV2 → `AudioClip`（`SBV2_BASE_URL`）。尺配分（§5）の素材にする。
4. **record**：ビューアをヘッドレスでキャプチャ → ffmpeg で 25s 縦mp4。
5. 必要になったら **Tier B**：praise-room に `renderFrame(state)` を足し、リプレイ駆動で忠実盤面へ。

## 完了ゲートとの関係

この doc + `docs/09`（trace 定義）を読めば、**他の人が Tier A ビューアを contract に一切触れず独立に実装でき**、praise-room の trace 1 本を 9:16 でリプレイ描画できること。
