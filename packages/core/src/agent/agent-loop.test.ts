/**
 * agent/agent-loop.test.ts — 終端リアクション（Closing Beat）と hook 伝播（docs/09）
 *
 * fake DreamGame ＋ spy LlmClient で、ループ本体（ゲーム非依存）の締め挙動を検証する：
 * - terminal/deadend/maxTurns で closing が付き、invalidAction では付かない
 * - llm.closing 未実装なら degrade（closing 未生成でも take は成立）
 * - closing 生成が throw しても best-effort で take は落ちない
 * - closing は apply を呼ばず turns[] に影響しない（リプレイ決定論）
 * - GameMeta.hook が DreamTrace.hook へ verbatim 複写される
 */

import { describe, expect, it, vi } from 'vitest';

import { runAgentLoop } from './agent-loop.js';
import { createActionValidator } from './action-validator.js';
import { createPromptBuilder } from './prompt-builder.js';
import type { AIChanPerception } from '../perception/schema.js';
import type { DreamGame } from '../play-api/contract.js';
import type { AgentResponse, ClosingResponse } from './response-schema.js';
import type { ChatMessage, LlmClient } from './types.js';

type FakeState = { n: number };
type FakeAction = 'go';
type Mode = 'terminal' | 'maxTurns' | 'deadend';

/** 挙動を切り替えられる最小 DreamGame（ゲーム固有の意味を持たない） */
function fakeGame(mode: Mode, hook?: string): DreamGame<FakeState, FakeAction> {
  return {
    meta: {
      id: 'fake',
      title: 'フェイク',
      actionVocabulary: ['go'] as const,
      maxTurns: 3,
      ...(hook !== undefined && { hook }),
    },
    init: () => ({ n: 0 }),
    perceive: (s): AIChanPerception => ({
      turn: s.n,
      scene: { summary: `状態 ${s.n}`, elements: [{ ref: 'x', description: 'ぼんやりした何か', salience: 'clear' }] },
      // deadend は最初から affordances 空（手詰まり経路）。
      affordances: mode === 'deadend' ? [] : [{ action: 'go', label: 'すすむ' }],
      feedback: s.n === 0 ? [] : [{ description: 'すこし進んだ', valence: 'neutral' }],
      closure: 'unfolding',
    }),
    apply: (s) => ({ state: { n: s.n + 1 }, events: [] }),
    // terminal は 1 手で閉じる。maxTurns は決して閉じない（安全弁で抜ける）。
    isTerminal: (s) => (mode === 'terminal' ? s.n >= 1 : false),
  };
}

/** go を選び続ける spy client。closing の実装有無を切り替えられる */
function spyClient(opts: { withClosing?: boolean; closingThrows?: boolean } = {}): LlmClient & {
  closingSpy: ReturnType<typeof vi.fn>;
} {
  const closingSpy = vi.fn(async (_messages: ChatMessage[]): Promise<ClosingResponse> => {
    if (opts.closingThrows) throw new Error('closing 失敗');
    return { observation: '締めの観察', speech: '……ここで、閉じるんだね。' };
  });
  const client: LlmClient & { closingSpy: typeof closingSpy } = {
    async complete(): Promise<AgentResponse> {
      return { observation: 'o', speech: 'すすむ', action: 'go' };
    },
    closingSpy,
  };
  if (opts.withClosing !== false) {
    (client as LlmClient).closing = (m) => closingSpy(m);
  }
  return client;
}

function deps(llm: LlmClient) {
  return { llm, prompt: createPromptBuilder(), validator: createActionValidator() };
}

describe('runAgentLoop: 終端リアクション（Closing Beat）', () => {
  it('terminal で closing が付き、action を持たず、終端 state を perceive している', async () => {
    const game = fakeGame('terminal');
    const llm = spyClient();
    const trace = await runAgentLoop(game, deps(llm), { seed: 0 });

    expect(trace.endReason).toBe('terminal');
    expect(trace.closing).toBeDefined();
    expect(trace.closing!.response.speech.length).toBeGreaterThan(0);
    // action キーを持たない（ClosingResponse は observation/speech のみ）
    expect('action' in trace.closing!.response).toBe(false);
    // 終端 state（最後の apply 後＝n:1）を perceive した画面
    expect(trace.closing!.perception).toEqual(game.perceive({ n: 1 }));
    expect(llm.closingSpy).toHaveBeenCalledTimes(1);
  });

  it('deadend でも closing が付く（affordances 空の state を perceive して締める）', async () => {
    const trace = await runAgentLoop(fakeGame('deadend'), deps(spyClient()), { seed: 0 });
    expect(trace.endReason).toBe('deadend');
    expect(trace.turns).toHaveLength(0);
    expect(trace.closing).toBeDefined();
  });

  it('maxTurns でも closing が付く', async () => {
    const game = fakeGame('maxTurns');
    const trace = await runAgentLoop(game, deps(spyClient()), { seed: 0 });
    expect(trace.endReason).toBe('maxTurns');
    expect(trace.turns).toHaveLength(game.meta.maxTurns);
    expect(trace.closing).toBeDefined();
  });

  it('invalidAction では closing を付けない（不良 take は締めない）', async () => {
    const badLlm = spyClient();
    badLlm.complete = async () => ({ observation: 'o', speech: 's', action: 'fly-away' });
    const trace = await runAgentLoop(fakeGame('terminal'), deps(badLlm), { seed: 0 });
    expect(trace.endReason).toBe('invalidAction');
    expect(trace.closing).toBeUndefined();
    expect(badLlm.closingSpy).not.toHaveBeenCalled();
  });

  it('llm.closing 未実装なら degrade（closing 未生成でも take は成立）', async () => {
    const trace = await runAgentLoop(fakeGame('terminal'), deps(spyClient({ withClosing: false })), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    expect(trace.closing).toBeUndefined();
    expect(trace.turns.length).toBeGreaterThan(0);
  });

  it('closing 生成が throw しても best-effort で take は落ちない', async () => {
    const trace = await runAgentLoop(fakeGame('terminal'), deps(spyClient({ closingThrows: true })), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    expect(trace.closing).toBeUndefined();
    expect(trace.turns.length).toBeGreaterThan(0);
  });
});

describe('runAgentLoop: closing は決定論（turns/action 列に影響しない）', () => {
  it('closing あり/なしで turns[] が同一（リプレイの素は不変）', async () => {
    const withC = await runAgentLoop(fakeGame('terminal'), deps(spyClient()), { seed: 0 });
    const without = await runAgentLoop(fakeGame('terminal'), deps(spyClient({ withClosing: false })), { seed: 0 });
    expect(withC.turns).toEqual(without.turns);
    // closing は turns に積まれない
    for (const t of withC.turns) expect(t.action).toBe('go');
  });
});

describe('runAgentLoop: hook 伝播', () => {
  it('GameMeta.hook を DreamTrace.hook へ verbatim 複写する', async () => {
    const trace = await runAgentLoop(fakeGame('terminal', 'これは、へんな夢の問い。'), deps(spyClient()), {
      seed: 0,
    });
    expect(trace.hook).toBe('これは、へんな夢の問い。');
  });

  it('hook 未設定なら DreamTrace.hook は undefined', async () => {
    const trace = await runAgentLoop(fakeGame('terminal'), deps(spyClient()), { seed: 0 });
    expect(trace.hook).toBeUndefined();
  });
});
