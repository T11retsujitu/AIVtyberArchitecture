/**
 * agent/agent-loop.ts — runAgentLoop（docs/09）
 *
 * core が 1 take を回す手順。DreamGame 契約「だけ」に依存し、ゲーム固有の意味を持ち込まない。
 * 終了条件は 3 つだけ：terminal（ゲームが閉じた）／deadend（affordances 空）／maxTurns（安全弁）。
 */

import type { DreamGame } from '../play-api/contract.js';
import { agentResponseJsonSchema } from './response-schema.js';
import type { ActionValidator, LlmClient, PromptBuilder, Reask } from './types.js';
import type { DreamTrace, EndReason, TraceTurn } from './trace.js';

export type RunAgentLoopDeps = {
  llm: LlmClient;
  prompt: PromptBuilder;
  validator: ActionValidator;
};

export type RunAgentLoopOptions = {
  seed: number;
};

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

    const { action, corrected, finalResponse } = await validator.resolve(
      first,
      perception.affordances,
      reask,
    );

    // action は validator が affordances 内であることを保証している。
    const { state: nextState, events } = game.apply(state, action as A);
    state = nextState;

    turns.push({ turn, perception, response: finalResponse, action, corrected, events });

    if (game.isTerminal(state)) {
      endReason = 'terminal';
      break;
    }
  }

  return {
    gameId: game.meta.id,
    title: game.meta.title,
    seed: opts.seed,
    endReason,
    turns,
  };
}
