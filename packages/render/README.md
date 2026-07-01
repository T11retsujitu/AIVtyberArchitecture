# @dream/render — Tier A ビューア（docs/11）

`DreamTrace`（1 take）を **9:16 の縦型ショート**として 1 ターンずつリプレイ描画する、最小の Tier A ビューア。
規範は `docs/11-render-pipeline.md`。**contract 非依存**（`perception` の質的フィールド + `response.speech` だけを読む）。**外部アセット・依存・ビルドなし。**

## 使い方

```bash
# 1) take（DreamTrace の JSON）を作る。既定で ./takes に書き出す
node packages/games/praise-room/dist/demo.js 42     # pnpm build 済み前提
#   → ./takes/praise-room-seed42.json

# 2a) いちばん簡単：ビューアを開いて JSON をドラッグ&ドロップ（サーバ不要・file:// で動く）
#     packages/render/viewer/index.html をブラウザで開く

# 2b) ?src= で自動読み込みしたいとき：依存ゼロの静的サーバを使う（リポジトリ直下で）
pnpm --filter @dream/render serve
#     → http://localhost:5173/packages/render/viewer/?src=/takes/praise-room-seed42.json
```

## いま描くもの（Tier A）

| 入力（perception 等） | 画面表現 |
|---|---|
| `closure` opening/unfolding/closing | 背景の色調・ビネット・立ち絵の伏せ目・尺感 |
| `scene.summary` | 上部の淡い情景テキスト |
| `scene.elements[]`（`ref`/`salience`/`description`） | 光の粒。位置は `ref` のハッシュで決定的、`salience` で存在感（faint/clear/vivid） |
| `feedback[].valence` | 色のパルス（good=暖色 / bad=赤 / strange=紫 / neutral=灰） |
| `response.speech` | 字幕（これだけが表側の言葉・docs/00 §4） |
| `endReason` | 終端カード（閉じた / 手詰まり / 醒めた） |

## 意図的な制約（docs/11）

- **座標・px・秒・スコアを画面に出さない**（不変条件#1,#5）。要素位置はゲーム座標ではなく `ref` ハッシュ由来。
- **`RawState` を読まない**（Tier A は perception のみ）。忠実な盤面が要るゲームは Tier B（ゲーム内 `renderFrame` + 決定論リプレイ）で。
- **立ち絵・情景はプレースホルダ**。アセットは後で差し替え前提（CSS のみで最小表現）。
- **尺は暫定の固定長**。本来は 1 ターン = `speech` の音声長（`docs/11 §5`）。音声配線は次段。
