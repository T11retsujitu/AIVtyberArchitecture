/**
 * agent/action-validator.ts — 語彙の妥当性と是正（docs/09・docs/12）
 *
 * 正常系：response.action ∈ affordances → そのまま採用（ok:true）。
 * 語彙外：reask で有効な action 一覧を添えて再要求（既定 2 回）。直れば ok:true（corrected:true）。
 * 使い切ってもなお語彙外：ok:false（invalidAction）。**フォールバックしない**（#5）。
 *   → セリフと行動が食い違う take を作らないため。ループが take を失敗として閉じる。
 *
 * apply に語彙外 action が届くのは「validator のバグ」（docs/02）。ok:true の action は必ず語彙内。
 */

import type { Affordance } from '../perception/schema.js';
import type { AgentResponse } from './response-schema.js';
import type { ActionValidator, Reask, ResolveOutcome } from './types.js';

export function createActionValidator(maxRetries = 2): ActionValidator {
  return {
    async resolve(
      response: AgentResponse,
      affordances: Affordance[],
      reask: Reask,
    ): Promise<ResolveOutcome> {
      if (affordances.length === 0) {
        // ループの不変条件違反：空 affordances で resolve を呼んではならない。
        throw new Error('action-validator.resolve called with empty affordances');
      }
      const valid = affordances.map((a) => a.action);

      let current = response;
      let corrected = false;
      let attempts = 1; // 初回応答を 1 と数える

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (valid.includes(current.action)) {
          return { ok: true, action: current.action, corrected, finalResponse: current };
        }
        // 語彙外。是正を試みる。
        corrected = true;
        if (attempt < maxRetries) {
          current = await reask(valid);
          attempts++;
        }
      }

      // 再試行を使い切ってもなお語彙外 → take 失敗（フォールバックしない）。
      return { ok: false, reason: 'invalidAction', attempts, lastResponse: current };
    },
  };
}
