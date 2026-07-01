/**
 * praise-room / state.test.ts — 決定論・縦通し・validator フォールバック・不変条件#1
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
  type AgentResponse,
  type LlmClient,
} from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { praiseRoom, PRAISE_ROOM_ACTIONS } from './index.js';

const VOCAB = new Set<string>(PRAISE_ROOM_ACTIONS);

function deps(llm: LlmClient) {
  return { llm, prompt: createPromptBuilder(), validator: createActionValidator() };
}

describe('praise-room: メタ（公開フック・docs/11）', () => {
  it('meta.hook は非空で、生メカニクス数値を含まない（不変条件 #1）', () => {
    expect(praiseRoom.meta.hook).toBeTruthy();
    expect(() => assertNoRawMechanicsText(praiseRoom.meta.hook!, 'hook')).not.toThrow();
  });
});

describe('praise-room: 縦通し（perceive→llm→apply）', () => {
  it('mock で 1 take を回し、受容で閉じる（締めの一言も付く）', async () => {
    const trace = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });

    expect(trace.turns.length).toBeGreaterThan(0);
    expect(trace.endReason).toBe('terminal');
    for (const t of trace.turns) {
      expect(VOCAB.has(t.action), `action ${t.action} は語彙内`).toBe(true);
      expect(t.response.speech.length).toBeGreaterThan(0);
      expect(t.action).toBe(t.response.action);
    }
    // 終端リアクション：夢が閉じたあとの締めの一言が付く（docs/09 Closing Beat）
    expect(trace.closing).toBeDefined();
    expect(trace.closing!.response.speech.length).toBeGreaterThan(0);
    // hook が trace へ複写されている
    expect(trace.hook).toBe(praiseRoom.meta.hook);
  });

  it('全ターンの perception が不変条件#1 ガードを通る（生メカニクス数値なし）', async () => {
    const trace = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
    for (const t of trace.turns) {
      expect(findRawMechanics(t.perception)).toEqual([]);
    }
  });
});

describe('praise-room: 決定論', () => {
  it('trace の action 列を apply で再生すると同じ perception 列になる', async () => {
    const trace = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
    const actions = trace.turns.map((t) => t.action);

    let state = praiseRoom.init(0);
    for (let i = 0; i < actions.length; i++) {
      expect(praiseRoom.perceive(state)).toEqual(trace.turns[i]!.perception);
      const action = actions[i]!;
      state = praiseRoom.apply(state, action as (typeof PRAISE_ROOM_ACTIONS)[number]).state;
    }
  });

  it('同じ seed なら trace が完全一致、別 seed なら入りが変わる', async () => {
    const a = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
    const b = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
    expect(a).toEqual(b);

    const odd = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 1 });
    expect(odd.turns[0]!.perception.scene).not.toEqual(a.turns[0]!.perception.scene);
  });
});

describe('praise-room: 終端理由（#4 ターン上限は runAgentLoop の担当）', () => {
  it('ターン上限に達しただけでは isTerminal にならない（安全弁はループが管理）', () => {
    const late = { ...praiseRoom.init(0), turn: praiseRoom.meta.maxTurns + 5 };
    expect(praiseRoom.isTerminal(late)).toBe(false);
  });

  it('受容も解消もしないと maxTurns で閉じる（terminal に潰れない）', async () => {
    // 常に look を選ぶ客。closeness は上がるが warmth/withdrawn は動かない → 終端条件に達しない。
    const alwaysLook: LlmClient = {
      async complete(): Promise<AgentResponse> {
        return { observation: 'x', speech: 'すこし、見てみる。', action: 'look' };
      },
    };
    const trace = await runAgentLoop(praiseRoom, deps(alwaysLook), { seed: 0 });
    expect(trace.endReason).toBe('maxTurns');
    expect(trace.turns.length).toBe(praiseRoom.meta.maxTurns);
  });
});

describe('praise-room: action-validator（語彙外は救済せず take 失敗・#5）', () => {
  it('再試行を使い切っても語彙外なら invalidAction で失敗し、apply されない', async () => {
    // 常に語彙外を返す意地悪クライアント。reask しても直らない → take 失敗。
    const evilLlm: LlmClient = {
      async complete(): Promise<AgentResponse> {
        return { observation: 'x', speech: 'ふぁ……', action: 'fly-away' };
      },
    };

    const trace = await runAgentLoop(praiseRoom, deps(evilLlm), { seed: 0 });

    expect(trace.endReason).toBe('invalidAction');
    expect(trace.turns).toHaveLength(0); // 一度も apply しない
    expect(trace.failure?.reason).toBe('invalidAction');
    expect(trace.failure?.turn).toBe(0);
    expect(trace.failure?.lastResponse.action).toBe('fly-away');
    expect(trace.failure?.attempts).toBe(3); // 初回 + reask 2
  });

  it('reask で語彙内に直れば corrected:true で採用される（軽い劣化）', async () => {
    // 初回だけ語彙外、以降は語彙内を返す。1 ターン目が是正されて成立する。
    let n = 0;
    const flakyLlm: LlmClient = {
      async complete(): Promise<AgentResponse> {
        n += 1;
        return n === 1
          ? { observation: 'x', speech: 'ふぁ……', action: 'fly-away' }
          : { observation: 'x', speech: 'そっと触れる', action: 'touch' };
      },
    };

    const trace = await runAgentLoop(praiseRoom, deps(flakyLlm), { seed: 0 });

    expect(trace.turns.length).toBeGreaterThan(0);
    expect(trace.turns[0]!.corrected).toBe(true);
    expect(trace.turns[0]!.action).toBe('touch');
    expect(VOCAB.has(trace.turns[0]!.action)).toBe(true);
    expect(trace.failure).toBeUndefined();
  });
});

describe('praise-room: provenance（#3 / docs/12 B）', () => {
  it('未指定なら provenance は unknown で埋まり、決定論を壊さない', async () => {
    const a = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
    expect(a.provenance.runId).toBe('unknown');
    expect(a.provenance.createdAt).toBe('unknown');
    expect(a.provenance.model).toEqual({ provider: 'unknown', name: 'unknown' });

    // 注入していないので trace 全体が同 seed で一致（provenance が非決定論源にならない）。
    const b = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
    expect(a).toEqual(b);
  });

  it('注入した provenance が trace に載る', async () => {
    const trace = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), {
      seed: 0,
      provenance: {
        runId: 'run-123',
        createdAt: '2026-07-01T00:00:00.000Z',
        model: { provider: 'mock', name: 'det-mock' },
        promptVersion: 'p1',
        characterBibleVersion: 'cb1',
        gameVersion: '0.0.0',
      },
    });
    expect(trace.provenance.runId).toBe('run-123');
    expect(trace.provenance.model.name).toBe('det-mock');
    expect(trace.provenance.characterBibleVersion).toBe('cb1');
    expect(trace.provenance.gameVersion).toBe('0.0.0');
  });
});
