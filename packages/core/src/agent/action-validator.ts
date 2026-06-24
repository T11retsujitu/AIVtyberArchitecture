/**
 * agent/action-validator.ts — 語彙の妥当性と是正（docs/09）
 *
 * 正常系：response.action ∈ affordances → そのまま採用。
 * 語彙外：reask で有効な action 一覧を添えて再要求（既定 2 回）。
 * 使い切ってもなお語彙外：決定論的フォールバック = affordances[0].action。
 *
 * apply に語彙外 action が届くのは「validator のバグ」（docs/02）。ここで必ず吸収する。
 */

import type { Affordance } from '../perception/schema.js';
import type { AgentResponse } from './response-schema.js';
import type { ActionValidator, Reask, ResolveResult } from './types.js';

export function createActionValidator(maxRetries = 2): ActionValidator {
  return {
    async resolve(
      response: AgentResponse,
      affordances: Affordance[],
      reask: Reask,
    ): Promise<ResolveResult> {
      const valid = affordances.map((a) => a.action);
      const fallback = affordances[0]?.action;
      if (fallback === undefined) {
        // ループの不変条件違反：空 affordances で resolve を呼んではならない。
        throw new Error('action-validator.resolve called with empty affordances');
      }

      let current = response;
      let corrected = false;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (valid.includes(current.action)) {
          return { action: current.action, corrected, finalResponse: current };
        }
        // 語彙外。是正を試みる。
        corrected = true;
        if (attempt < maxRetries) {
          current = await reask(valid);
        }
      }

      // 再試行を使い切ってもなお語彙外 → 決定論的フォールバック（劣化 take）。
      return {
        action: fallback,
        corrected: true,
        finalResponse: { ...current, action: fallback },
      };
    },
  };
}
