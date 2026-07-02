/**
 * dont-move / terminal.ts — 終端判定（docs/02）
 *
 * terminal になるのは 4 経路：
 *   - 満ち：部屋が出口まで歩いた（roomShift >= ROOM_GOAL）
 *   - こわれ（型3）：二歩目で床が破れた（stepped）
 *   - すれ違い（型4）：手をのばし続けて空振りが極まった（reached >= REACH_LIMIT）
 *   - 見失い（型5）：じっとし続けて出口が霧に溶けた（drowse >= DROWSE_LIMIT）
 *
 * maxTurns（型2 醒め）はここでは扱わない——安全弁は runAgentLoop の担当（docs/09）。
 * 専用の deadend 経路は持たない。terminal 時に perceive が affordances を空にするのは
 * ループの dead-end 経路の裏打ち（バックストップ）にすぎない。
 */

import { DROWSE_LIMIT, REACH_LIMIT, ROOM_GOAL, type DontMoveState } from './state.js';

export function isTerminal(state: DontMoveState): boolean {
  return (
    state.stepped ||
    state.roomShift >= ROOM_GOAL ||
    state.reached >= REACH_LIMIT ||
    state.drowse >= DROWSE_LIMIT
  );
}
