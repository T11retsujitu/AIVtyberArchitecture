/**
 * dont-move / state.test.ts — 決定論・縦通し・不変条件#1・5 通りの閉じ方
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
import { dontMove, DONT_MOVE_ACTIONS } from './index.js';

const VOCAB = new Set<string>(DONT_MOVE_ACTIONS);

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

describe('dont-move: メタ（公開フック・docs/11）', () => {
  it('meta.hook は非空で、生メカニクス数値を含まない（不変条件 #1）', () => {
    expect(dontMove.meta.hook).toBeTruthy();
    expect(() => assertNoRawMechanicsText(dontMove.meta.hook!, 'hook')).not.toThrow();
  });
});

describe('dont-move: 縦通し（perceive→llm→apply）', () => {
  it('mock で 1 take を回し、レバーで部屋が歩いてクィブル満ちで閉じ、締めの一言とフックが付く', async () => {
    // 決定論モックは先頭 action（lever）を選ぶ → 部屋が出口まで歩いて満ちる（このゲームの核）。
    const trace = await runAgentLoop(dontMove, deps(createMockLlmClient()), { seed: 0 });

    expect(trace.turns.length).toBeGreaterThan(0);
    expect(trace.endReason).toBe('terminal');
    for (const t of trace.turns) {
      expect(VOCAB.has(t.action), `action ${t.action} は語彙内`).toBe(true);
      expect(t.response.speech.length).toBeGreaterThan(0);
      expect(t.action).toBe(t.response.action);
    }
    // 全手が lever（クィブル経路）で、最後に見えた手応えは good（部屋がすべる）
    expect(trace.turns.every((t) => t.action === 'lever')).toBe(true);
    const last = trace.turns[trace.turns.length - 1]!;
    expect(last.perception.feedback[0]?.valence).toBe('good');
    // 終端リアクション（docs/09 Closing Beat）と公開フック（docs/11）
    expect(trace.closing).toBeDefined();
    expect(trace.closing!.response.speech.length).toBeGreaterThan(0);
    expect(trace.hook).toBe(dontMove.meta.hook);
  });

  it('全ターン＋締めの perception が不変条件#1 ガードを通る（生メカニクス数値なし）', async () => {
    const trace = await runAgentLoop(dontMove, deps(createMockLlmClient()), { seed: 0 });
    for (const t of trace.turns) {
      expect(findRawMechanics(t.perception)).toEqual([]);
    }
    expect(findRawMechanics(trace.closing!.perception)).toEqual([]);
  });
});

describe('dont-move: 決定論', () => {
  it('trace の action 列を apply で再生すると同じ perception 列になる', async () => {
    const trace = await runAgentLoop(dontMove, deps(createMockLlmClient()), { seed: 0 });
    const actions = trace.turns.map((t) => t.action);

    let state = dontMove.init(0);
    for (let i = 0; i < actions.length; i++) {
      expect(dontMove.perceive(state)).toEqual(trace.turns[i]!.perception);
      const action = actions[i]!;
      state = dontMove.apply(state, action as (typeof DONT_MOVE_ACTIONS)[number]).state;
    }
  });

  it('同じ seed なら trace が完全一致、別 seed（偶奇）なら入りが変わる', async () => {
    const a = await runAgentLoop(dontMove, deps(createMockLlmClient()), { seed: 0 });
    const b = await runAgentLoop(dontMove, deps(createMockLlmClient()), { seed: 0 });
    expect(a).toEqual(b);

    const odd = await runAgentLoop(dontMove, deps(createMockLlmClient()), { seed: 1 });
    expect(odd.turns[0]!.perception.scene).not.toEqual(a.turns[0]!.perception.scene);
  });
});

describe('dont-move: 5 通りの閉じ方（docs/01 の失敗の型 ＋ 知恵による満ち）', () => {
  it('満ち（クィブル）：レバーを引き続けると部屋が出口まで歩き、terminal で閉じる', async () => {
    const trace = await runAgentLoop(dontMove, deps(always('lever')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    // stirs（strange・みじろぎ）→ slides（good）→ arrives の3手
    expect(trace.turns.length).toBe(3);
    expect(trace.turns[1]!.perception.feedback[0]?.valence).toBe('strange');
    expect(trace.turns[2]!.perception.feedback[0]?.valence).toBe('good');
    expect(trace.closing).toBeDefined();
  });

  it('こわれ（型3）：一歩目は警告（部屋が軋む）、二歩目で床が破れて terminal（不可逆）', async () => {
    const trace = await runAgentLoop(dontMove, deps(always('step')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    // 初手は警告（strange）＝前触れ、二歩目でこわれ（bad）
    expect(trace.turns[0]!.perception.feedback).toEqual([]); // 初手ターンの feedback は空
    expect(trace.turns[0]!.action).toBe('step');
    const last = trace.turns[trace.turns.length - 1]!;
    expect(last.perception.feedback[0]?.valence).toBe('strange'); // 直前の警告が見えている
    expect(trace.turns.length).toBe(2);
    expect(trace.closing).toBeDefined();
  });

  it('すれ違い（型4）：手をのばし続けると届かない空振り（strange）の連続で terminal', async () => {
    const trace = await runAgentLoop(dontMove, deps(always('reach')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    expect(trace.turns.some((t) => t.perception.feedback[0]?.valence === 'strange')).toBe(true);
    expect(trace.closing).toBeDefined();
  });

  it('見失い（型5）：じっとし続けると出口が霧に溶けて terminal（clear→faint）', async () => {
    const trace = await runAgentLoop(dontMove, deps(always('stay')), { seed: 0 });
    expect(trace.endReason).toBe('terminal');
    // 出口（elements[0]）の存在感が clear から faint まで落ちている
    expect(trace.turns[0]!.perception.scene.elements[0]!.salience).toBe('clear');
    expect(trace.turns[trace.turns.length - 1]!.perception.scene.elements[0]!.salience).toBe('faint');
    expect(trace.closing).toBeDefined();
  });

  it('醒め（型2）：どれとも決まらず尺が尽きると maxTurns', async () => {
    const cycle = ['stay', 'reach', 'lever'];
    const trace = await runAgentLoop(
      dontMove,
      deps(scriptClient((n) => cycle[n % cycle.length]!)),
      { seed: 0 },
    );
    expect(trace.endReason).toBe('maxTurns');
    expect(trace.turns.length).toBe(dontMove.meta.maxTurns);
    expect(trace.closing).toBeDefined();
  });
});

describe('dont-move: 終端理由（#4 ターン上限は runAgentLoop の担当）', () => {
  it('ターン上限に達しただけでは isTerminal にならない（安全弁はループが管理）', () => {
    const late = { ...dontMove.init(0), turn: dontMove.meta.maxTurns + 5 };
    expect(dontMove.isTerminal(late)).toBe(false);
  });

  it('終端では affordances が空になる（dead-end バックストップ）', async () => {
    const trace = await runAgentLoop(dontMove, deps(always('lever')), { seed: 0 });
    expect(trace.closing!.perception.affordances).toEqual([]);
  });
});
