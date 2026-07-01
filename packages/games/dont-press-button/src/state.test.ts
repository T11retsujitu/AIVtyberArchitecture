/**
 * dont-press-button / state.test.ts — 決定論・縦通し・不変条件#1・6 通りの閉じ方
 *
 * LLM 部分はモック／スクリプトで固定し、ゲーム遷移の決定論と契約の縦通しを検証する。
 * @dream/core はソース解決（vitest.config.ts のエイリアス）。
 */

import { describe, expect, it } from 'vitest';

import {
  runAgentLoop,
  createActionValidator,
  createPromptBuilder,
  findRawMechanics,
  assertNoRawMechanicsText,
  type ClosingResponse,
  type LlmClient,
} from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { dontPressButton, DONT_PRESS_ACTIONS } from './index.js';

const VOCAB = new Set<string>(DONT_PRESS_ACTIONS);

function deps(llm: LlmClient) {
  return { llm, prompt: createPromptBuilder(), validator: createActionValidator() };
}

/** 決められた action を返し、締めビートも返すスクリプト client（closing を実装＝締めが付く） */
function scriptClient(pick: (n: number) => string): LlmClient {
  let n = 0;
  return {
    async complete() {
      return { observation: 'x', speech: 'む……', action: pick(n++) };
    },
    async closing(): Promise<ClosingResponse> {
      return { observation: '締めの観察', speech: '……ここで、閉じるんだね。' };
    },
  };
}

const always = (action: string) => scriptClient(() => action);

describe('dont-press-button: メタ（公開フック・docs/11）', () => {
  it('meta.hook は非空で、生メカニクス数値を含まない（不変条件 #1）', () => {
    expect(dontPressButton.meta.hook).toBeTruthy();
    expect(() => assertNoRawMechanicsText(dontPressButton.meta.hook!, 'hook')).not.toThrow();
  });
});

describe('dont-press-button: 縦通し（perceive→llm→apply）', () => {
  it('mock で 1 take を回し、そばで待って受容（満ち）で閉じ、締めの一言とフックが付く', async () => {
    // 決定論モックは先頭 action（wait）を選ぶ → そばで待って満ちる。
    const trace = await runAgentLoop(dontPressButton, deps(createMockLlmClient()), { seed: 0 });

    expect(trace.turns.length).toBeGreaterThan(0);
    expect(trace.endReason).toBe('terminal');
    for (const t of trace.turns) {
      expect(VOCAB.has(t.action), `action ${t.action} は語彙内`).toBe(true);
      expect(t.response.speech.length).toBeGreaterThan(0);
      expect(t.action).toBe(t.response.action);
    }
    // 終端リアクション（docs/09 Closing Beat）と公開フック（docs/11）
    expect(trace.closing).toBeDefined();
    expect(trace.closing!.response.speech.length).toBeGreaterThan(0);
    expect(trace.hook).toBe(dontPressButton.meta.hook);
  });

  it('全ターン＋締めの perception が不変条件#1 ガードを通る（生メカニクス数値なし）', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(createMockLlmClient()), { seed: 0 });
    for (const t of trace.turns) {
      expect(findRawMechanics(t.perception)).toEqual([]);
    }
    expect(findRawMechanics(trace.closing!.perception)).toEqual([]);
  });
});

describe('dont-press-button: 決定論', () => {
  it('trace の action 列を apply で再生すると同じ perception 列になる', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(createMockLlmClient()), { seed: 0 });
    const actions = trace.turns.map((t) => t.action);

    let state = dontPressButton.init(0);
    for (let i = 0; i < actions.length; i++) {
      expect(dontPressButton.perceive(state)).toEqual(trace.turns[i]!.perception);
      const action = actions[i]!;
      state = dontPressButton.apply(state, action as (typeof DONT_PRESS_ACTIONS)[number]).state;
    }
  });

  it('同じ seed なら trace が完全一致、別 seed（偶奇）なら入りが変わる', async () => {
    const a = await runAgentLoop(dontPressButton, deps(createMockLlmClient()), { seed: 0 });
    const b = await runAgentLoop(dontPressButton, deps(createMockLlmClient()), { seed: 0 });
    expect(a).toEqual(b);

    const odd = await runAgentLoop(dontPressButton, deps(createMockLlmClient()), { seed: 1 });
    expect(odd.turns[0]!.perception.scene).not.toEqual(a.turns[0]!.perception.scene);
  });
});

describe('dont-press-button: 6 通りの閉じ方（docs/01 の失敗の型 ＋ 満ち）', () => {
  it('満ち（受容）：そばで待つと terminal で閉じる', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(always('wait')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    expect(trace.turns[trace.turns.length - 1]!.perception.feedback[0]?.valence).toBe('good');
    expect(trace.closing).toBeDefined();
  });

  it('こわれ（型3）：初手 press は警告、次で押すと terminal（不可逆）', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(always('press')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    // 初手は怯み（strange）＝前触れ、最後がこわれ（bad）
    expect(trace.turns[0]!.perception.feedback).toEqual([]); // 初手ターンの feedback は空
    expect(trace.turns[0]!.action).toBe('press');
    const last = trace.turns[trace.turns.length - 1]!;
    expect(last.perception.feedback[0]?.valence).toBe('strange'); // 直前の警告が見えている
    expect(trace.turns.length).toBe(2);
    expect(trace.closing).toBeDefined();
  });

  it('すれ違い（型4）：手をかざし続けると strange の連続で terminal', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(always('hover')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    expect(trace.turns.some((t) => t.perception.feedback[0]?.valence === 'strange')).toBe(true);
    expect(trace.closing).toBeDefined();
  });

  it('見失い（型5）：目をそらし続けると気配が薄れて terminal', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(always('lookAway')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    // salience が faint まで落ちている（vivid→faint の見失い）
    expect(trace.turns[trace.turns.length - 1]!.perception.scene.elements[0]!.salience).toBe('faint');
    expect(trace.closing).toBeDefined();
  });

  it('手詰まり（型1）：離れ続けると追われて affordances 空＝deadend', async () => {
    const trace = await runAgentLoop(dontPressButton, deps(always('stepBack')), { seed: 0 });
    expect(trace.endReason).toBe('deadend');
    expect(trace.turns.length).toBeGreaterThan(0);
    expect(trace.closing).toBeDefined();
  });

  it('ぐるり／醒め（型6/型2）：どれとも決まらず尺が尽きると maxTurns', async () => {
    const cycle = ['wait', 'hover', 'stepBack', 'lookAway'];
    const trace = await runAgentLoop(
      dontPressButton,
      deps(scriptClient((n) => cycle[n % cycle.length]!)),
      { seed: 0 },
    );
    expect(trace.endReason).toBe('maxTurns');
    expect(trace.turns.length).toBe(dontPressButton.meta.maxTurns);
    expect(trace.closing).toBeDefined();
  });
});

describe('dont-press-button: 終端理由（#4 ターン上限は runAgentLoop の担当）', () => {
  it('ターン上限に達しただけでは isTerminal にならない（安全弁はループが管理）', () => {
    const late = { ...dontPressButton.init(0), turn: dontPressButton.meta.maxTurns + 5 };
    expect(dontPressButton.isTerminal(late)).toBe(false);
  });
});
