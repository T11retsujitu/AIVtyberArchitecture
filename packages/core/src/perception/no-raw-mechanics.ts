/**
 * perception/no-raw-mechanics.ts — 不変条件 #1 の機械的ガード
 *
 * 規範は docs/07-perception-schema.md「絶対禁止」節。docs が約束していた
 * 「perceive() 出力に数値座標・px・秒が混入していないかの lint 的チェック」の実体。
 *
 * 各ゲームの perception テストから `assertNoRawMechanics(game.perceive(s))` で呼ぶ。
 *
 * 注意：これはヒューリスティックな安全網であり、完全な証明ではない。
 * - 検査対象は「AIちゃんに見える描写文字列」だけ（summary / description / label / hint /
 *   feedback.description）。機械可読IDである `ref`（"shadow-1"）や `action` は
 *   数字を含んでよいので検査しない。
 * - 偽陽性（正常な描写を誤検知）を避けることを優先し、明確なメカニクス語形のみを弾く。
 *   見逃し（偽陰性）は許容する。疑わしい新パターンが出たら RAW_MECHANIC_PATTERNS に足す。
 */

import type { AIChanPerception } from './schema.js';

/** 弾く「生のメカニクス数値」のパターン。docs/07 の禁止リストに対応 */
export const RAW_MECHANIC_PATTERNS: readonly { name: string; re: RegExp }[] = [
  // ピクセル：12px / 12 px
  { name: 'pixels', re: /\d+\s*px\b/i },
  // 座標タプル：(3,4) / (3, 4) / (-1, 2)
  { name: 'coordinate', re: /\(\s*-?\d+\s*,\s*-?\d+\s*\)/ },
  // タイマー秒（日本語）：3秒 / 3.2秒
  { name: 'seconds-ja', re: /\d+(\.\d+)?\s*秒/ },
  // タイマー秒（英）：3.2s / 12s（語中の s は除外する負の先読み付き）
  { name: 'seconds-en', re: /\d+(\.\d+)?\s*s(?![a-z0-9])/i },
  // エンジン変数の代入形：score=80 / hp:3 / dist = 4.2 / remaining: 12
  {
    name: 'engine-var',
    re: /\b(x|y|dist|distance|hp|score|remaining|time|timer|count|turn)\s*[:=]\s*-?\d/i,
  },
] as const;

/** AIちゃんに見える描写文字列だけを集める（ref / action / kind は機械IDなので除外） */
function describedStrings(p: AIChanPerception): string[] {
  const out: string[] = [p.scene.summary];
  for (const el of p.scene.elements) out.push(el.description);
  for (const a of p.affordances) {
    out.push(a.label);
    if (a.hint !== undefined) out.push(a.hint);
  }
  for (const f of p.feedback) out.push(f.description);
  return out;
}

/** 検出された違反のリスト。空配列なら合格 */
export type RawMechanicViolation = {
  /** 違反パターン名（"pixels" 等） */
  pattern: string;
  /** 違反を含んでいた描写文字列 */
  text: string;
  /** マッチした部分文字列 */
  match: string;
};

/** 1 本の描写文字列を走査して違反の配列を返す（perception 版・hook 版が共有する核） */
export function findRawMechanicsInText(text: string): RawMechanicViolation[] {
  const violations: RawMechanicViolation[] = [];
  for (const { name, re } of RAW_MECHANIC_PATTERNS) {
    const m = re.exec(text);
    if (m) violations.push({ pattern: name, text, match: m[0] });
  }
  return violations;
}

/** perceive() 出力に生メカニクス数値が混入していないか走査する。違反の配列を返す */
export function findRawMechanics(p: AIChanPerception): RawMechanicViolation[] {
  return describedStrings(p).flatMap(findRawMechanicsInText);
}

/** 違反リストを docs/07 案内つきの例外文言に整形する（共通） */
function violationError(violations: RawMechanicViolation[], where: string): Error {
  const detail = violations
    .map((v) => `  [${v.pattern}] "${v.match}" in: ${JSON.stringify(v.text)}`)
    .join('\n');
  return new Error(`不変条件 #1 違反：${where}に生のメカニクス数値が混入しています（docs/07）。\n${detail}`);
}

/** 違反があれば例外を投げる。各ゲームの perception テストの最終ゲートに使う */
export function assertNoRawMechanics(p: AIChanPerception): void {
  const violations = findRawMechanics(p);
  if (violations.length > 0) throw violationError(violations, 'perceive() 出力');
}

/**
 * 単一テキスト（GameMeta.hook 等・表側の公開文言）に生メカニクス数値が無いかの機械ゲート。
 * 注意：これは数値パターンのみを弾く安全網で、RAG/LLM/トークン等の技術語や日本語のメカ語まで
 * 網羅はしない（#5 の技術語はオーサリング＋レビューで担保・docs/00）。
 */
export function assertNoRawMechanicsText(text: string, label = '公開文言'): void {
  const violations = findRawMechanicsInText(text);
  if (violations.length > 0) throw violationError(violations, label);
}
