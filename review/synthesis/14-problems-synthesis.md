# 14（統合）— 現状の問題点（レビュー×コード実地検証）

> 作成：2026-07-02。`review/` の3系統（Antigravity / codexReview1 / codexReview2）の Shorts 成功レビューを読み、**各指摘を実際のコードに突き合わせて検証**した統合結果。
> レビューは docs/07・09 時点の推測を含み、一部は最近のコミットで解決済み or docs で意図的に先送り済みだったため、「本当に未着手で致命的なもの」と「レビューは叫ぶが実は優先度が低いもの」を分離するのが本ドキュメントの肝。
> **末尾の「更新メモ」に、この統合以降に実装した内容を記載**（この分析自体は 2026-07-02 時点のスナップショット）。

## 総括

3レビュー一致で、制作**基盤**（決定論・構造化出力・Perception 境界・Mode B+）は高評価（技術 8/10）。
一方 Shorts の**初見フック（3/10）・1本の面白さ（4/10）・固定ファン化（3/10）が弱い**。
最も致命的で完全に未着手だったのは以下の **P0 2件**。

---

## 🔴 P0 — 本当に致命的・完全に未着手（コードで確認済み）

### ① 終端リアクション欠如 — Shorts のオチが構造上録れない
`runAgentLoop` は `apply` の直後 `isTerminal` で**即 break** し、終端 state を `perceive` せず、行動なしの締めのセリフも trace に積まない（`packages/core/src/agent/agent-loop.ts:104-108`）。
全セリフは「行動を選ぶ前」の perception から生成されるため、**締めの行動の“結果”に反応した一言が構造上存在しない**。
- 実証：praise-room で `touch` して夢が満ちる時、その報い（`praise.accepted`→「触れると、あたたかいものが返ってきた」valence:`good`）は `perceive(終端state)` にしか無いのに、ループはそこへ到達せず break する（`praise-room/perception.ts:58`）。夢のいちばん美味しい瞬間が録画されない。
- 追い打ち：`TraceTurn` は `action` 必須（`trace.ts`）で、そもそも“セリフだけのターン”を表現できない。dead-end 経路も LLM を呼ぶ前に break。
- 出典：codexReview1 §2.1（「致命的」最優先）/ codexReview2（結末で新しい解釈が生まれない）/ Antigravity 課題#2。

### ② 冒頭フック（異常な問い / hook カード / タイトル生成）が未設計
AIちゃんは仕様上「叫ばない・静か」で音声フックが弱く、最初の1〜2秒で「何を見る動画か」が伝わらない。
grep しても hook / title 生成 / 冒頭カードの層は **docs にもコードにも存在しない**。字幕は `response.speech` のみに制限（不変条件#5）されているため、**表側に別レイヤの新設が必要**。
- 出典：codexReview1 §2.2 / codexReview2 優先#2 / Antigravity 課題#1。

---

## 🟠 P1 — 重要だが素材はある（partial / open）

| # | 問題 | 状態 | 要点 | 出典 |
|---|---|---|---|---|
| ③ | 落差/反転ビートが構造要求になっていない ＋ 公開第1作ゲームが無い | partial | 落差の素材（型3こわれ・valence good→bad/strange・salience 減衰）は docs にあるが、`unfolding` に「反転を最低1回」を求めるルールが無い。praise-room は検証用で落差が小さい。公開映えするゲームが1本も実装されていないのが実害。 | codexReview2 優先#1 / codexReview1 §4 / game_ideas |
| ④ | セリフの単調・反復（言い回し多様化ルールが無い） | partial | キャラ設定自体が「静・淡々」に寄せるバイアス（docs/00 §1）。緩和は「揺らぎ」と失敗の型のみで、speech の言い回し多様化ルールは無い。プロンプト層＋take選定で対処可（契約は触らない）。 | codexReview1 §4 / codexReview2 |
| ⑤ | 固定ファン化の基盤（前回記憶・定番・コメント反映・連続課題）が皆無 | open | どれも未着手（跨エピソード記憶は存在しない）。docs/11 が現 wave の非目標として明示。後続 wave で「エピソード・メタ層」を別設計（Perception/契約は不変のまま）。 | codexReview1 §3 / codexReview2 優先#5 |
| ⑥ | 公開レンダーに内部語（opening/closing/terminal/deadend/maxTurns）が生表示で漏れる | partial | 設計意図はクリーンだが、Tier A ビューアが `p.closure` / `trace.endReason` を生表示（`viewer/index.html`）。gloss 表示に替えるだけの軽微修正。 | codexReview1 §5-2 |
| ⑦ | Tier B（ゲーム固有レンダー）未実装で自作ゲーム感が伝わらない（映像競争力2/10） | partial（＝意図的先送り） | docs/11 §2 が「まず Tier A を MVP、Tier B は表現要求が出てから」と明記した順序。穴ではない。公開ゲームが決まってから着手でよい。 | codexReview1 §2.3 / codexReview2 優先#4 |

---

## ⚪ レビューは強く叫ぶが、優先度は低い（設計上の既決 / 意図的先送り）

- **Tier B 未実装** → docs/11 §2 が意図的に MVP 後回しと明記。穴ではなく順序（上表⑦）。
- **take 選定 UI のツール化** → P2（open）。運用が回り始めてから。Tier A ビューア＋選定チェックリストの拡張で足りる。
- **「静キャラ×静展開を分ける」** → docs/01 が既に「毎回すっきり勝つ25秒は退屈／崩れる瞬間に受け止めが立つ」と明文化済み（addressed）。新規対応は不要。

> **要旨**：レビューの指摘のうち“本当に手を動かすべき”は **P0の2つ（終端リアクション・冒頭フック）**。これはゲーム非依存の **core/render 基盤**なので、どのゲームを作るにせよ先に入れる。

---

## 更新メモ（この統合以降の実装状況）

- **P0① 終端リアクション：実装済み**（commit `ab8a010`）。専用 `ClosingResponse{observation,speech}`（action なし）を `DreamTrace.closing` に載せ、ループ脱出後に `perceive(最終state)→buildClosing→llm.closing` を best-effort で生成。`turns[]` 不変＝リプレイ決定論を維持。
- **P0② 冒頭フック：実装済み**（commit `ab8a010`）。`GameMeta.hook?` → `DreamTrace.hook` へ複写、Tier A viewer が開幕カード(0-2s)を描画。⑥の内部語漏れも同時に gloss 化で是正。
- **③ 公開第1作：実装済み**（commit `37bcb94`）。「押さないでボタン」（→ `15-game-recommendation.md`）。落差ビートの構造要求化（docs/01 追記）は未了。
- **⑦ Tier B：dont-press-button に実装済み**（commit `d0e7f63`）。`render-frame.ts`（震えるボタンの SVG）＋ replay 駆動。
- **④ セリフ単調 / ⑤ 固定ファン基盤：未着手**。④は Mode B+ 実測（2026-07-02）で「震えが止まった」反復・「ふぁ」多用として顕在化 → 打率改善プラン（`docs/14`）で対応予定。
