# 07 — Perception Schema（AIChanPerception）★

このドキュメントは**全ゲームの境界条件**を定義する。`packages/core/src/perception/schema.ts` はこの規範の TypeScript 化であり、両者が食い違ったら**このdocを正**とする。

毎ターン、ゲームの生状態（`RawState`）は `perceive()` を通って `AIChanPerception` に変換され、それだけが AIちゃん（LLM）に渡る。**AIちゃんは生状態を一切見ない。** 見えるのはこのスキーマが許す「描写」だけ。

---

## なぜ厳しく縛るのか

AIちゃんは「奇妙なゲームの夢を見ている」存在であって、ゲームエンジンを操作しているのではない。
座標・ピクセル・残り時間といった**メカニクスの数字が見えてしまうと、夢ではなく操作になる**。キャラ表現が壊れ、セリフが「敵が(3,4)にいます」のような無機質なものになる。

さらに実務上の理由：Perceptionに生エンジン状態が漏れると、ゲームごとに表現がバラバラになり、契約の意味が消える。**「描写しか渡さない」は表現上の都合であると同時に、移植性の防壁**でもある。

---

## 絶対禁止（不変条件 #1）

`AIChanPerception` のいかなるフィールドにも、以下を**生で**入れてはならない：

- **座標・ベクトル・距離の数値**（`x`, `y`, `(3,4)`, `12px`, `dist=4.2` 等）
- **ピクセル・解像度・画面サイズ**
- **タイマー・経過秒・残り時間の数値**（`3.2s`, `remaining=12` 等）
- **生のスコア・HP・内部カウンタ等のエンジン変数名**

これらは必ず**質的な描写**に変換する。例：
- `enemyDistance: 1` → `salience: 'vivid'` + `description: "影が、もう手の届くところまで来ている"`
- `timeLeft: 3` → `closure: 'closing'`
- `score: 80` → `feedback: { description: "手応えが続いている", valence: 'good' }`

> 量ではなく**質**（faint/clear/vivid、good/bad/neutral/strange、opening/unfolding/closing）で渡す。これがこのスキーマ全体の設計原理。

---

## スキーマ

```ts
type AIChanPerception = {
  /** 離散ターン番号。タイマーではない。AIちゃんには直接見せず、トレース・整合用 */
  turn: number;

  /** 今見えているものの描写 */
  scene: {
    /** 一文での全体描写（「目の前に、ぼやけた部屋がひとつ」） */
    summary: string;
    /** 個別要素の描写。座標を持たない */
    elements: SceneElement[];
  };

  /** このターン取りうる行動（限定列挙）。空配列なら手詰まり＝夢の終わり方の一型 */
  affordances: Affordance[];

  /** 直前ターンの行動の結果として起きたことの描写。初手は空配列 */
  feedback: FeedbackSignal[];

  /** 夢の局面ヒント。25秒構造の「閉じ」をエージェントに匂わせる */
  closure: ClosureHint;
};

type SceneElement = {
  /** 安定参照ID。座標ではなく「同一性」を表す（"shadow-1" 等）。ターンをまたいで同じ対象には同じrefを使う */
  ref: string;
  /** 描写。メカニクス語を含めない */
  description: string;
  /** 注意の引き方。量ではなく質 */
  salience: 'faint' | 'clear' | 'vivid';
};

type Affordance = {
  /** action id。apply()が受理する語彙の一語。限定列挙（不変条件 #2） */
  action: string;
  /** AIちゃんに見せる描写的ラベル（「そっと触れてみる」） */
  label: string;
  /** 補足の匂わせ（任意） */
  hint?: string;
};

type FeedbackSignal = {
  /** 何が起きたかの描写 */
  description: string;
  /** 質的評価のみ。数値の増減は渡さない */
  valence: 'good' | 'bad' | 'neutral' | 'strange';
};

type ClosureHint = 'opening' | 'unfolding' | 'closing';
```

---

## フィールド契約（実装者が守ること）

| フィールド | 契約 |
|---|---|
| `turn` | 0始まりの単調増加。`apply()` 1回で +1。プロンプトに数値として露出しない（局面表現に使う） |
| `scene.summary` | 必ず1文以上。空文字禁止。メカニクス語禁止 |
| `scene.elements[].ref` | 同一対象はターンをまたいで同一ref。新規出現で新ref。座標禁止 |
| `scene.elements[].salience` | 「どれくらい注意を引くか」の3段階。距離や数の代理として使ってよいが、**数値は出さない** |
| `affordances` | `apply()` が**今のstateで実際に受理する** action のみ。受理しないactionを並べない |
| `affordances[].action` | `GameMeta.actionVocabulary` の部分集合。語彙外禁止 |
| `feedback` | 直前 `apply()` の `events` を質的描写に変換したもの。初手ターンは `[]` |
| `closure` | 残りターン感に応じて opening→unfolding→closing。タイマー秒は使わない |

---

## 整合の検証

- `affordances[].action ⊆ GameMeta.actionVocabulary`
- `perceive()` の出力に**数値座標・px・秒**が文字列として混入していないこと
  → `@dream/core` の `assertNoRawMechanics(perceive(state))` で機械的に検証する
  （実体：`packages/core/src/perception/no-raw-mechanics.ts`）。各ゲームの perception テストの最終ゲートに置く。
  ヒューリスティック（偽陽性回避優先）なので、新しい漏洩パターンを見つけたら `RAW_MECHANIC_PATTERNS` に追加する。
- 同じ `seed` + 同じ action列 → 同じ `AIChanPerception` 列（決定論。`apply()` 側の不変条件と対。次Waveの `state.spec.ts` で検証）

---

## 完了ゲートとの関係

このdocだけを読んで、`packages/games/praise-room/perception.ts` を**他の人が独立に書ける**こと。
そのために「praise-room の RawState のどの量を、どの質的フィールドに落とすか」の対応表は、各ゲームの `docs` か `perception.ts` 冒頭コメントに残す（このdocはあくまで全ゲーム共通の枠）。
