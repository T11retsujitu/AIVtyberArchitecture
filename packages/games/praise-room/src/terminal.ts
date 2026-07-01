/**
 * praise-room / terminal.ts — 終端判定
 *
 * 受容（warmth が十分）か、解消（離れ続けた）かで夢は閉じる。
 * ターン上限（安全弁）はここに入れない。runAgentLoop が maxTurns として管理する（docs/09）。
 * ここに `turn >= MAX_TURNS` を入れると、上限到達が terminal に潰れ、
 * endReason の `maxTurns` が到達不能になるため。
 * perceive はこの判定を使って、終端で affordances を空にする（手詰まり経路の裏打ち）。
 */

import { WARMTH_GOAL, WITHDRAW_LIMIT, type PraiseRoomState } from './state.js';

export function isTerminal(state: PraiseRoomState): boolean {
  return state.warmth >= WARMTH_GOAL || state.withdrawn >= WITHDRAW_LIMIT;
}
