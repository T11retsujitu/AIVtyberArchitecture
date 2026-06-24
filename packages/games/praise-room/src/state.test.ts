/**
 * praise-room / state.test.ts — 決定論・縦通し・validator フォールバック
 *
 *   pnpm --filter @dream/praise-room build
 *   node --test packages/games/praise-room/dist/
 *
 * LLM 部分はモック／スクリプトで固定し、ゲーム遷移の決定論と契約の縦通しを検証する。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runAgentLoop,
  createActionValidator,
  createPromptBuilder,
  type AgentResponse,
  type LlmClient,
} from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { praiseRoom, PRAISE_ROOM_ACTIONS } from './index.js';

const VOCAB = new Set<string>(PRAISE_ROOM_ACTIONS);

function deps(llm: LlmClient) {
  return { llm, prompt: createPromptBuilder(), validator: createActionValidator() };
}

test('縦通し：mock で 1 take を回し、受容で閉じる', async () => {
  const trace = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });

  assert.ok(trace.turns.length > 0, 'ターンがある');
  assert.equal(trace.endReason, 'terminal', '受容エンディングで閉じる');
  for (const t of trace.turns) {
    assert.ok(VOCAB.has(t.action), `action ${t.action} は語彙内`);
    assert.ok(t.response.speech.length > 0, 'speech は非空');
    assert.ok(t.action === t.response.action, '採用 action と応答 action が一致');
  }
});

test('決定論：trace の action 列を apply で再生すると同じ perception 列になる', async () => {
  const trace = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
  const actions = trace.turns.map((t) => t.action);

  // trace の各 perception を、init+apply の素の再生で作り直して一致を確認。
  let state = praiseRoom.init(0);
  for (let i = 0; i < actions.length; i++) {
    const replay = praiseRoom.perceive(state);
    assert.deepEqual(
      replay,
      trace.turns[i]!.perception,
      `turn ${i} の perception が再生と一致`,
    );
    const action = actions[i]!;
    state = praiseRoom.apply(state, action as (typeof PRAISE_ROOM_ACTIONS)[number]).state;
  }
});

test('決定論：同じ seed なら trace が完全一致、別 seed なら入りが変わる', async () => {
  const a = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
  const b = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 0 });
  assert.deepEqual(a, b, '同じ seed → 同じ trace');

  const odd = await runAgentLoop(praiseRoom, deps(createMockLlmClient()), { seed: 1 });
  assert.notDeepEqual(
    odd.turns[0]!.perception.scene,
    a.turns[0]!.perception.scene,
    'seed が違えば初手の見え方が変わる',
  );
});

test('validator：語彙外 action は是正フォールバックされ、apply に語彙外は届かない', async () => {
  // 常に語彙外を返す意地悪クライアント。reask しても直らない → フォールバック。
  const evilLlm: LlmClient = {
    async complete(): Promise<AgentResponse> {
      return { observation: 'x', speech: 'ふぁ……', action: 'fly-away' };
    },
  };

  const trace = await runAgentLoop(praiseRoom, deps(evilLlm), { seed: 0 });

  assert.ok(trace.turns.length > 0, 'ターンがある');
  for (const t of trace.turns) {
    assert.equal(t.corrected, true, '是正マークが立つ');
    assert.ok(VOCAB.has(t.action), `フォールバック action ${t.action} は語彙内`);
  }
});
