/**
 * praise-room / terminal.ts — 終端判定
 *
 * 受容（warmth が十分）か、解消（離れ続けた）か、安全弁（ターン上限）で夢は閉じる。
 * perceive はこの判定を使って、終端で affordances を空にする（手詰まり経路の裏打ち）。
 */

import { MAX_TURNS, WARMTH_GOAL, WITHDRAW_LIMIT, type PraiseRoomState } from './state.js';

export function isTerminal(state: PraiseRoomState): boolean {
  return (
    state.warmth >= WARMTH_GOAL ||
    state.withdrawn >= WITHDRAW_LIMIT ||
    state.turn >= MAX_TURNS
  );
}
