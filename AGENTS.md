# AGENTS.md — Codex / 汎用エージェント エントリ

内容は `CLAUDE.md` と同一の方針に従う。このファイルもポインタに徹する。

## 最初に読むもの

1. `CLAUDE.md` — プロジェクト全体方針と不変条件
2. `docs/00-character-bible.md` ★
3. `docs/02-play-api-contract.md`
4. `docs/07-perception-schema.md` ★

## やってはいけないこと（不変条件の要約）

- Perceptionに座標・ピクセル・タイマーを出さない（描写で渡す）
- actionの自由文字列化
- LLM応答の非構造化
- DreamGame契約の無断 breaking change
- 成果物の表側への技術用語露出

迷ったらコードより先にdocsを直す。
