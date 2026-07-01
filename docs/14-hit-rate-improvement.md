# 14 — 打率改善プラン（実 take のヒット率を上げる）

> 状態：⬜ 計画（design + 反対弁護レビュー済み。実装はこの doc を正とする）。契約（docs/02/07/09）は原則不変。B の `PromptContext.recentSpeech` のみ additive 変更＝doc-first＋人間承認。

## 背景

Mode B+ 実 take 選定（NIM=`qwen/qwen3.5-122b-a10b`・10本・2026-07-02）で、セリフは概ねキャラらしいのに **直接投稿可 0/10（打率0%）** だった。この doc はその原因を潰す改善計画。

## 目標

同条件再測（同モデル・N=10・同 seed 循環・同 temperature）で次を**同時に**満たす：

- **直接投稿可 ≥ 3/10**（人手8軸の総合合格）。
- **press を含む終端 ≥ 1/10**（`stepBack` 手詰まりと**分離した独立指標**。核の緊張が画面に立った証。press or stepBack の OR 束ねは不採用）。
- **満ち占有 ≤ 6/10 かつ 満ち率 > 0/10**（退避/醒め一択への付け替えを防ぐ下限。単独では合否に使わず直接投稿可と併記）。
- **endReason 種別 ≥ 3**（terminal / deadend / maxTurns が分布に出る。改修前は満ち terminal 一択）。
- **antiRepeat 平均 ≥ 3.0**（B の実効性ゲート。未達なら B を撤回）。
- **suspect フラグ率 ≤ 1/10**（観測破綻 3/10 を機械捕捉して測定精度を担保）。
- best score のヘッドルーム改善（改修前 best=t10 25/40 を上回る take が出る）。
- 再測は `promptVersion`/`gameVersion` を provenance に刻んで A/B を識別する。

## 根本原因

- **機構**：`wait` が「周囲の気配に無関係な、確実に短手数で満ちる単調ソース」になっており、10/10 が「見守る→震えが鎮まる→満ち」に収束。`press` は毎ターン affordances に常在するのに、キャラ核（眠そうだが生真面目・見守り）＋ボタンの明示的懇願「押さないで」の二重抑止で **0 回**。核の緊張（押す誘惑 vs 拒む震え）が一度も立たない。
- **プロンプト**：`prompt.build` が毎ターン perception だけで独立生成し、直前の自分の speech を知らない → 「震えが止まった/おさまった」を本編＋closing で多重反復（antiRepeat 8/10 最低）、「ふぁ……」が全ターン付与で語尾単調。
- **計器**：破綻 take（t06「いたいくなって」/ t09「目を話す」/ t04「電気が漏れてる」の 3/10）を機械的に落とせず、打率の測定精度が低い。

---

## ワークストリーム A：ゲーム側の落差（満ち一択の解消 ＋ press 誘惑ピークの機構化）｜effort L

**狙い**：A が「保証する」のは**満ち一択の分散**（純 `wait` は満ちず醒める＋気配をいなす管理経路の導入）まで。press 発火は**別レバー**として測る（反対弁護：press は挙動任せで機構ゲートされていない）。周囲の気配 `urging`（＝「押してあげて」の圧）を導入し、高いとき `wait` を good→strange に反転させて「そばに居ること自体がボタンを苦しめている＝見守り＝加害」方向へ動機を割り、press/退避を現実の選択肢にする。同時に**高 urging 時の描写に回復の含み**（すこし身を引けばまた落ち着けそう）を必ず織り込み、満ちへの管理経路を LLM から不可視にしない（反対弁護：満ちを壊すと退避/醒め一択に化ける懸念への対処）。

| ファイル | 変更 |
|---|---|
| `state.ts` | `urging:number`（内部 RawState）追加。定数 `URGE_MAX=4`, `URGE_PRESSURE=2`。EventKind に `button.strains`（そばに居ても気配にせかされ震えが増す＝strange）追加。他の閾値は据え置き。 |
| `apply-action.ts` | `wait` を分岐：`urging<URGE_PRESSURE` は従来（companionship+1・insistence-1・`calms`/good）、`urging>=URGE_PRESSURE` は companionship を増やさず insistence+1・`strains`/strange。`wait`/`hover` は urging+1、`stepBack`/`lookAway` は urging-1（気配をいなす）。`press` は不変。純関数維持。 |
| `perception.ts` | 第2 `SceneElement` `surroundings-1`（urging>=1 で出現）。urging>=URGE_PRESSURE の description に**回復の含みを必須**で織り込む。salience は urging で faint→clear→vivid。`button.strains` feedback（見守り＝加害トーン）追加。数値/座標/秒なし。closure の closing 条件に urging>=URGE_PRESSURE を OR。量→質 対応表コメントに urging を追記。 |
| `game.ts` | `init` に `urging:0` 追加。 |
| `terminal.ts` | **変更なし**（意図的）。純 wait 連打で気配に詰まった局面は maxTurns 醒め（型2）が担う。terminal に潰すと到達不能（praise-room の教訓・docs/09）。 |
| `state.test.ts` | 満ち経路は `always('wait')` では満ちなくなるため `scriptClient(['wait','lookAway','wait','wait'])` に差し替え（terminal＋最終記録 turn feedback=good を固定）。mock 縦通しは `maxTurns`（型2醒め）へ更新。findRawMechanics は surroundings-1 込みで [] 維持。こわれ/すれ違い/見失い/手詰まり/ぐるり/決定論 replay は現行スクリプト不変で緑。 |

契約変更：なし（第2気配は既存 `scene.elements[]` 配列に載せるだけ・additive schema 変更なし）。

---

## ワークストリーム B：prompt の反復・口癖抑制 ＋ 能動性｜effort M

**狙い**：直近 speech を表側テキストとして注入し、同一言い回し・同一状態語の再利用を禁じる。「押すな→むずむず」の緊張と素朴な衝動（許可トーン・命令でない）を常時明示。**反対弁護（弱モデル qwen3 では否定制約・逐語注入がむしろ反復を増やしうる）を反映し、B は antiRepeat 実測 ≥ 3.0 を合格条件に含め、上がらなければ撤回**して反復抑制を選定側（n-gram 重複の suspect フラグ）へ寄せる。構造的多様性は主に A の2段階 feedback が担い、B は補助レバー。

| ファイル | 変更 |
|---|---|
| `core/agent/types.ts` | `PromptContext` に optional `recentSpeech?: string[]`（新→古・最大2件）。表側テキストのみ＝#1非抵触・trace 非格納・未指定なら後方互換。build/buildClosing 署名は不変。 |
| `core/agent/agent-loop.ts` | リングバッファ `let recent:string[]=[]` を導入し、各ターン `ctx={title, ...(recent.length>0 && {recentSpeech:recent})}` を build に渡す。採用後 `recent=[speech,...recent].slice(0,2)`。締めでも同じ ctx。recent は trace に格納しない（決定論・provenance 非影響）。 |
| `core/agent/prompt-builder.ts` | CHARACTER_CORE に常時ルール追記（「ふぁ……」は1 take 1回まで／語尾を散らす／毎ターン観察を一歩進める／気になったら触れる・こわいから離れる素朴な衝動も選んでよい＝許可トーン／「押さないで」と言われるほど指先がむずむずする気持ちも正直に＝内部メモ）。`renderRecentSpeech` を追加（`[action]` トークンや salience 語を含めない体裁で user 末尾に append・未指定なら何も足さない）。CHARACTER_CORE_CLOSING に「本編の焼き直しにせず別モチーフ（余韻・匂い・温度・静けさ）で締める」を追記。docs/00 §1–4 の4原則は保持。 |
| `core/agent/prompt-builder.test.ts`（新規） | recentSpeech 未指定で追記ゼロ（旧プロンプト同一）・指定時のみ反復禁止文が入る。`renderRecentSpeech` 出力に `[action]`/salience 語が混入しないこと（mock の決定論選択を注入が変えない担保）。 |

契約変更（**doc-first＋人間承認が必要**）：`PromptContext.recentSpeech?` の additive 追加。docs/09 に「直近 speech を反復抑制目的で渡す表側テキスト。#1非抵触・trace 非格納・決定論非影響」を追記してから実装する。

---

## ワークストリーム C：日本語品質ゲート ＋ 打率再測プロトコル｜effort S

**狙い**：破綻 take を機械捕捉して打率の測定精度を上げる。**まず最小 2 ファイル**（`jp-quality-gate.ts`＋test）＋ `TakeSummary` への `quality` 追加に絞る（反対弁護：1ゲーム N=10 に対し過剰。ゲート単体は打率を上げない）。`score-batch.ts` は A を実装して実 take で press が出るのを確認してから追加（計器より効果側を先に検証）。**ゲートは直さない・生成し直さない、疑わしきは reject でなく suspect フラグ止まり**（書き換えは捏造）。

| ファイル | 変更 |
|---|---|
| `dont-press-button/src/quality/jp-quality-gate.ts`（新規） | `no-raw-mechanics.ts` の findXInText を踏襲した純粋関数群。`MECHA_SURFACE_DENY`（電気/電流/回路/システム/データ/バグ/エラー/リセット/起動/スコア 等・世界語「ボタン/部屋/震え」は除外して偽陽性回避）と `JA_SUSPECT_DENY`（観測済み誤変換 curated ペア：目を話す→目を離す、いたいく→痛く 等）。verdict: `clean` / `suspect`。 |
| `.../quality/jp-quality-gate.test.ts`（新規） | 観測破綻3種（目を話す/いたいくなって/電気が漏れてる）を回帰検出。偽陽性ガード：正常描写・実 t01–t10 clean サンプルが `clean`。全ターン「ふぁ」時に ticRatio=1.0。 |
| `takes-batch.ts` | 成功 take ごとに `quality` を計算し `TakeSummary`（script ローカル型・契約外）に additive 追加。index.json の各 take に載せ、末尾サマリに suspect 率・endReason 内訳・**press 終端の本数（stepBack 手詰まりと分離）**を出す。 |
| `score-batch.ts`（第2フェーズ） | A の press 確認後に追加。純集計関数（打率/分布計算）にユニットテスト。 |

---

## 実装順序

1. **C の最小部分**（jp-quality-gate＋test＋takes-batch.quality）を先に入れる（index.json への additive のみで安全＝以後の再測の計器）。
2. **A** を実装（urging・見守り反転・回復含み描写・第2気配 element、state.test.ts 更新）。
3. A 実装後にベースライン再測 → **press を含む終端 > 0・満ち率 > 0・endReason 分散(≥3種)** を確認。press=0 なら `URGE_PRESSURE` を下げる／気配の mercy 描写を強める等**定数だけ**で調整し再測。
4. press 発火を確認できたら `score-batch.ts` と合否プロトコルを追加（効果側を確認してから計器を厚くする）。
5. **B** は `PromptContext.recentSpeech` の doc-first＋人間承認（docs/09 追記）を得てから実装。prompt-builder.test で後方互換と注入体裁を固定。
6. B を A/B 再測し **antiRepeat 平均 ≥ 3.0** を確認。上がらなければ B を撤回し、反復抑制を選定側の n-gram フラグへ寄せる。

## 不変条件チェックリスト

1. **#1**：`urging` は内部 RawState。perception には salience＋描写のみへ写す（数値/座標/秒なし）。`assertNoRawMechanics` を新描写込みで [] 維持。
2. **#2**：action は wait/press/hover/stepBack/lookAway の5個のまま。urging は action ではない。「むずむず」誘導は候補内 action の選好を促すだけ。
3. **#3**：LlmClient/response schema・zod parse を変えない。ゲートは後処理で flag/除外のみ（応答を書き換えない・parse を迂回しない）。
4. **#4**：DreamGame/AgentResponse/AIChanPerception の無断 breaking なし。第2気配は既存配列に載せるだけ。`PromptContext.recentSpeech` は optional additive で doc-first＋承認。`TakeSummary.quality`/index.json は契約外の中間生成物（消費者ゼロを確認）。
5. **#5**：気配 element は描写語のみ。`MECHA_SURFACE_DENY` は rewrite せず flag に留める。トーンのメカ語臭は人手審査で補う（数値ガードは拾わない）。
6. **決定論**：apply は純関数（urging も乱数なし）。`recentSpeech` は messages にのみ載り state/perception/apply/trace に流入しない。state.test.ts の replay（perceive deep-equal）は urging・第2element・quality 込みで不変。
7. **誤読対応**：`closure:'closing'` の通常ターン（action あり）と締めビート `trace.closing`（action なし）は別物。「closing ターンに action=矛盾」改修は**採用しない**。

## リスク

- A の mercy 誘導（「楽にしてあげて」）が press を「正解」に感じさせ、型3 の悔い（そっとしておけばよかった）のトーンが薄れる恐れ。締めは docs/01 型3 の受け止めで担保する前提だが、実 take で悔いが立つか要確認。
- 逆流：LLM が press でなく退避（stepBack/lookAway）へ逃げて醒め/見失いに再収束し、良い満ち take が減る恐れ。満ち率>0 の下限で監視、press=0 なら `URGE_PRESSURE` を下げる等で対処。
- 弱モデル qwen3 で B の否定制約・逐語注入がむしろ反復を増やす典型。antiRepeat 実測を合格条件にし未達なら撤回。
- denylist は既知パターンしか捕まえず偽陰性大。毎バッチのレビューで `JA_SUSPECT_DENY` を育てる運用コストが前提。偽陽性で世界語/擬態語を弾くと選定が痩せるため suspect 止まり。
- N=10 は統計的に弱く A/B 差の有意性は限定的（NIM のレート/コストと N≥20 のトレードオフ）。
- mock 縦通しデモが満ち→醒めに変わり「雛形が穏やかな受容で閉じる」当初意図が変わる（型2醒めも静かな受け止めだが要合意）。

## 未決事項（人間承認）

- B の `PromptContext.recentSpeech`（additive・#4）の docs/09 追記承認を実装前に取る。
- `promptVersion` をバンプするか（B の文言変更で A/B 比較の同一性が崩れる）。provenance/ベンチの追従要否。
- mock 縦通しデモの既定エンディングが満ち→醒めに変わることの合意。
- press が A 単独＋定数調整でも 0 のままの場合、機構を更に踏み込むか B の能動性許可と組み合わせるか。
- `score-batch.ts`／合否プロトコルの完成は A 実装後の press 確認を条件に着手（順序合意）。

## 完了ゲートとの関係

この doc + Mode B+ の実測（`review/synthesis/`）を読めば、**他の人が A/B/C を独立に実装し、同条件再測で打率が上がったかを合否基準で判定できる**こと。
