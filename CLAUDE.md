# CLAUDE.md — Claude Code エントリ

このファイルは**ポインタに徹する**。判断材料は `docs/` にある。コードを書く前に必ず該当docsを読むこと。

## このプロジェクトは何か

「AIちゃん」（眠そうで生真面目なAIの女の子）が、カスタムブラウザゲームの**夢**を見てプレイし、その観察を語る。
LLMエージェントがゲームを実プレイして**行動選択もセリフ生成も両方**行い（どちらもキャラ表現）、結果を**25秒の縦型ショート**にする。
運用は **Mode B+**：ターン制・状態JSON駆動・1エピソードを複数take撮って人間が選定する。

## 着手前に必ず読むdocs（★は毎回投入する最重要）

- `docs/00-character-bible.md` ★ — 不変キャラ設定 + Decision Policy
- `docs/02-play-api-contract.md` — DreamGame契約（`packages/core/src/play-api/contract.ts` の規範）
- `docs/07-perception-schema.md` ★ — AIChanPerception。全ゲームの境界条件

## 不変条件（崩すと全ゲームに波及する。変更は人間承認必須）

1. Perceptionに**座標・ピクセル・タイマーを露出させない**（描写で渡す）
2. actionは**限定列挙**。自由文字列禁止
3. LLM応答は**JSON mode / structured output で強制**
4. DreamGame契約の breaking change は**3ゲーム実装後は禁止**
5. 技術用語（RAG・ベクトルDB等）を**成果物の表側に出さない**

## Skillを増やす前のルール

新しい `.claude/skills/` を作る前に、**まず `docs/` に置けないか問う**こと（Skill増殖で破綻した過去の教訓）。Phase 0のSkillは5個固定。

## 完了ゲート

「**別の人が docs を読むだけで、praise-room の Perception を独立に書ける**」状態を満たすこと。
契約が曖昧なまま `packages/core/` を書くと、Perceptionに生エンジン状態が漏れて全ゲームの境界が壊れる——これが最大の失敗モード。
