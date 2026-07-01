import { describe, expect, it } from 'vitest';
import {
  AgentResponseSchema,
  agentResponseJsonSchema,
  ClosingResponseSchema,
  closingResponseJsonSchema,
} from './response-schema.js';

/**
 * 不変条件 #3 のドリフト検出。
 * zod スキーマ（AgentResponseSchema）と手書き JSON Schema（agentResponseJsonSchema）は
 * 同じ形を二重に定義しているため、片方だけ変えると静かにズレる。ここで両者の整合を縛る。
 */
describe('AgentResponse: zod ↔ JSON Schema の整合', () => {
  const zodKeys = Object.keys(AgentResponseSchema.shape).sort();
  const jsonKeys = Object.keys(agentResponseJsonSchema.properties).sort();

  it('プロパティ名の集合が一致する', () => {
    expect(jsonKeys).toEqual(zodKeys);
  });

  it('required が全プロパティと一致する（全て必須）', () => {
    expect([...agentResponseJsonSchema.required].sort()).toEqual(zodKeys);
  });

  it('追加プロパティを禁止している（strict ↔ additionalProperties:false）', () => {
    expect(agentResponseJsonSchema.additionalProperties).toBe(false);
    const res = AgentResponseSchema.safeParse({
      observation: 'a',
      speech: 'b',
      action: 'touch',
      extra: 'x',
    });
    expect(res.success).toBe(false);
  });
});

describe('AgentResponse: バリデーション挙動', () => {
  it('正常な応答を受理する', () => {
    const res = AgentResponseSchema.safeParse({
      observation: 'あったかい光がある',
      speech: 'そっと、触ってみる',
      action: 'touch',
    });
    expect(res.success).toBe(true);
  });

  it('空文字フィールドを拒否する（minLength:1 ↔ min(1)）', () => {
    for (const empty of ['observation', 'speech', 'action'] as const) {
      const res = AgentResponseSchema.safeParse({
        observation: 'a',
        speech: 'b',
        action: 'c',
        [empty]: '',
      });
      expect(res.success).toBe(false);
    }
  });
});

describe('ClosingResponse: 締めビートのスキーマ（docs/09 Closing Beat）', () => {
  it('observation ＋ speech を受理し、action フィールドは持たない', () => {
    const res = ClosingResponseSchema.safeParse({ observation: 'a', speech: 'b' });
    expect(res.success).toBe(true);
    expect(res.success && 'action' in res.data).toBe(false);
  });

  it('必須欠落・空文字は弾く（min(1)）', () => {
    expect(ClosingResponseSchema.safeParse({ observation: 'a' }).success).toBe(false);
    expect(ClosingResponseSchema.safeParse({ observation: '', speech: 'b' }).success).toBe(false);
  });

  it('余剰 action は strip して observation/speech だけ採用する（best-effort・非 strict）', () => {
    // NIM 等が通常ターンの癖で action を付けても締めは成立させる（docs/09）。
    const res = ClosingResponseSchema.safeParse({ observation: 'a', speech: 'b', action: 'go' });
    expect(res.success).toBe(true);
    expect(res.success && 'action' in res.data).toBe(false);
  });

  it('JSON Schema ミラーは observation/speech を required にしている', () => {
    expect([...closingResponseJsonSchema.required].sort()).toEqual(['observation', 'speech']);
    expect(Object.keys(closingResponseJsonSchema.properties).sort()).toEqual(['observation', 'speech']);
  });
});
