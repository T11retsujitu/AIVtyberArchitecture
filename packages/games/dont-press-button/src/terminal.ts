/**
 * dont-press-button / terminal.ts — 終端判定
 *
 * 「満ち以外の閉じ方」を複数持つ（docs/01 §4）。ここで true になる閉じ方：
 *   - pressed         … こわれ（型3）
 *   - companionship   … 満ち（受容・唯一の非失敗）
 *   - friction        … すれ違い（型4）
 *   - faded           … 見失い（型5）
 *
 * ここに入れない閉じ方（機構が別だから）：
 *   - 手詰まり（型1）… pursuit の極まりは perceive が affordances を空にして deadend にする。
 *     ここに入れると deadend が terminal に潰れて到達不能になる（praise-room の教訓と同じ）。
 *   - ぐるり／醒め（型6/型2）… 尺切れは runAgentLoop の maxTurns が担う（docs/09）。
 *
 * perceive はこの判定を使い、終端で affordances を空にする（手詰まり経路の裏打ち）。
 */

import {
  COMPANION_GOAL,
  FADE_LIMIT,
  FRICTION_LIMIT,
  type DontPressButtonState,
} from './state.js';

export function isTerminal(state: DontPressButtonState): boolean {
  return (
    state.pressed ||
    state.companionship >= COMPANION_GOAL ||
    state.friction >= FRICTION_LIMIT ||
    state.faded >= FADE_LIMIT
  );
}
