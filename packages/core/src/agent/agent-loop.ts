/**
 * agent/agent-loop.ts — runAgentLoop（docs/09）
 *
 * core が 1 take を回す手順。DreamGame 契約「だけ」に依存し、ゲーム固有の意味を持ち込まない。
 * 終了条件は 3 つだけ：terminal（ゲームが閉じた）／deadend（affordances 空）／maxTurns（安全弁）。
 */

import type { DreamGame } from '../play-api/contract.js';
import { agentResponseJsonSchema, closingResponseJsonSchema } from './response-schema.js';
import type { ActionValidator, LlmClient, PromptBuilder, Reask } from './types.js';
import type { ClosingBeat, DreamTrace, EndReason, TraceFailure, TraceProvenance, TraceTurn } from './trace.js';

export type RunAgentLoopDeps = {
  llm: LlmClient;
  prompt: PromptBuilder;
  validator: ActionValidator;
};

/**
 * trace の素性の入力（すべて任意・依存注入）。決定論を守るため core は
 * runId/createdAt/乱数/時計を生成しない。未指定は 'unknown' で埋まる（docs/12 B）。
 */
export type ProvenanceInput = {
  runId?: string;
  createdAt?: string;
  gameVersion?: string;
  gameCommitSha?: string;
  model?: { provider: string; name: string; params?: Record<string, unknown> };
  promptVersion?: string;
  characterBibleVersion?: string;
};

export type RunAgentLoopOptions = {
  seed: number;
  /** trace に残す素性。省略時は 'unknown' で埋まる（docs/12 B） */
  provenance?: ProvenanceInput;
};

/** ProvenanceInput → 完全な TraceProvenance（未指定を 'unknown' で埋める。定数なので決定論を壊さない） */
function resolveProvenance(input: ProvenanceInput | undefined): TraceProvenance {
  // 任意フィールド（gameVersion/gameCommitSha）は exactOptionalPropertyTypes のため
  // undefined を素で入れず、値があるときだけキーを付ける。
  return {
    runId: input?.runId ?? 'unknown',
    createdAt: input?.createdAt ?? 'unknown',
    model: input?.model ?? { provider: 'unknown', name: 'unknown' },
    promptVersion: input?.promptVersion ?? 'unknown',
    characterBibleVersion: input?.characterBibleVersion ?? 'unknown',
    ...(input?.gameVersion !== undefined && { gameVersion: input.gameVersion }),
    ...(input?.gameCommitSha !== undefined && { gameCommitSha: input.gameCommitSha }),
  };
}

export async function runAgentLoop<S, A extends string>(
  game: DreamGame<S, A>,
  deps: RunAgentLoopDeps,
  opts: RunAgentLoopOptions,
): Promise<DreamTrace> {
  const { llm, prompt, validator } = deps;
  const ctx = { title: game.meta.title };

  let state = game.init(opts.seed);
  const turns: TraceTurn[] = [];
  let endReason: EndReason = 'maxTurns';
  let failure: TraceFailure | undefined;

  for (let turn = 0; turn < game.meta.maxTurns; turn++) {
    const perception = game.perceive(state);

    // 早期 dead-end 判定：手詰まり＝夢の終わり方の一型（docs/07）。LLM は呼ばない。
    if (perception.affordances.length === 0) {
      endReason = 'deadend';
      break;
    }

    const messages = prompt.build(perception, ctx);
    const first = await llm.complete(messages, agentResponseJsonSchema);

    const reask: Reask = (validActions) =>
      llm.complete([...messages, prompt.correction(validActions)], agentResponseJsonSchema);

    const outcome = await validator.resolve(first, perception.affordances, reask);

    // 語彙外を使い切った → フォールバックせず take を失敗にする（#5・docs/12）。
    if (!outcome.ok) {
      endReason = 'invalidAction';
      failure = {
        reason: outcome.reason,
        turn,
        perception,
        lastResponse: outcome.lastResponse,
        attempts: outcome.attempts,
      };
      break;
    }

    const { action, corrected, finalResponse } = outcome;
    // action は validator が affordances 内であることを保証している。
    const { state: nextState, events } = game.apply(state, action as A);
    state = nextState;

    turns.push({ turn, perception, response: finalResponse, action, corrected, events });

    if (game.isTerminal(state)) {
      endReason = 'terminal';
      break;
    }
  }

  // 終端リアクション（docs/09 Closing Beat）。夢が閉じたあと、最後の state を perceive し直して
  // 「行動なしの締めのひとこと」を生成する。apply は呼ばない＝turns の action 列（リプレイの素）に
  // 影響せず決定論は保たれる。invalidAction（不良 take）には付けない。llm.closing 未実装なら degrade。
  // 締めは garnish なので生成失敗（NIM 障害等）でも take は捨てず closing を省くだけ（best-effort）。
  let closing: ClosingBeat | undefined;
  if (endReason !== 'invalidAction' && typeof llm.closing === 'function') {
    try {
      const finalPerception = game.perceive(state);
      const closingMessages = prompt.buildClosing(finalPerception, ctx, endReason);
      const response = await llm.closing(closingMessages, closingResponseJsonSchema);
      closing = { perception: finalPerception, response };
    } catch {
      closing = undefined;
    }
  }

  return {
    gameId: game.meta.id,
    title: game.meta.title,
    seed: opts.seed,
    endReason,
    turns,
    provenance: resolveProvenance(opts.provenance),
    // 公開フックは GameMeta の定数を verbatim 複写（決定論を壊さない・docs/11 の render 入力）。
    ...(game.meta.hook !== undefined && { hook: game.meta.hook }),
    ...(closing && { closing }),
    ...(failure && { failure }),
  };
}
