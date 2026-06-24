# docs/ — プロジェクトの背骨

コードより先にここを正とする。★は LLM に直接効く最重要ファイル（プロンプト投入 or 全ゲーム境界）。

| doc | 役割 | 状態 |
|---|---|---|
| `00-character-bible.md` ★ | 不変キャラ設定 + Decision Policy（毎ターン投入） | ✅ Phase 0 |
| `01-dream-design-rules.md` | 25秒構造・失敗の型6種 | ⬜ 次Wave |
| `02-play-api-contract.md` | DreamGame契約（core/play-api の規範） | ✅ Phase 0 |
| `06-anti-patterns.md` | 技術用語露出禁止など反面教師集 | ⬜ 次Wave |
| `07-perception-schema.md` ★ | AIChanPerception・全ゲームの境界条件 | ✅ Phase 0 |
| `08-memory-atom-design.md` | memory atom 設計 | ⬜ 次Wave |
| `09-agent-loop-spec.md` | runAgentLoop / AgentResponse 仕様 | ✅ |

## Phase 0 の完了ゲート

**別の人が `docs/00` `docs/02` `docs/07` を読むだけで、`praise-room` の Perception を独立に書ける**こと。

→ 縦 1 本（perceive→llm→apply）を `packages/games/praise-room/` で実証済み。
契約だけに依存する `runAgentLoop`（`packages/core/src/agent/`）と、鍵不要の決定論モック LLM で
take を回せる：`pnpm test`／`node packages/games/praise-room/dist/demo.js [seed]`。

## 不変条件（→ `CLAUDE.md` と同一。崩すと全ゲーム波及）

1. Perceptionに座標・ピクセル・タイマーを露出させない（描写で渡す）
2. actionは限定列挙。自由文字列禁止
3. LLM応答は JSON mode / structured output で強制
4. DreamGame契約の breaking change は3ゲーム実装後は禁止
5. 技術用語を成果物の表側に出さない
