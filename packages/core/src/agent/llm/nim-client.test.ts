/**
 * nim-client.test.ts — fetch 注入で NIM client を検証（ネット不要・docs/13）
 *
 * 見るのは：構造化出力の body 形（guided_json / json_schema）、パース、
 * コードフェンス耐性、transient 再試行、非 retriable の即時失敗、schema 強制。
 */

import { describe, it, expect, vi } from 'vitest';
import { createNimLlmClient, type NimClientConfig } from './nim-client.js';
import { agentResponseJsonSchema } from '../response-schema.js';
import type { ChatMessage } from '../types.js';

type FetchImpl = NonNullable<NimClientConfig['fetchImpl']>;

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'あなたは AIちゃん。' },
  { role: 'user', content: 'いま見えているもの… [look]' },
];

const VALID = { observation: '光に気を向けた。', speech: 'なんだろう、これ……', action: 'look' };

/** OpenAI 互換の 200 応答（content は文字列） */
function ok(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

/** (url, init) を受ける形の fetch モック（calls を検査できるよう引数型を明示） */
function mockFetch(impl: (url: unknown, init?: unknown) => Promise<Response>) {
  return vi.fn(impl);
}

function base(fetchImpl: FetchImpl): NimClientConfig {
  return { apiKey: 'nvapi-test', model: 'test/model', retryBackoffMs: 0, fetchImpl };
}

describe('createNimLlmClient', () => {
  it('既定は guided_json で schema を焼き、応答をパースして返す', async () => {
    const fetchImpl = mockFetch(async () => ok(JSON.stringify(VALID)));
    const client = createNimLlmClient(base(fetchImpl));

    const res = await client.complete(MESSAGES, agentResponseJsonSchema);
    expect(res).toEqual(VALID);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe('test/model');
    expect(body.messages).toEqual(MESSAGES);
    expect(body.nvext.guided_json).toEqual(agentResponseJsonSchema);
    expect(body.response_format).toBeUndefined();
  });

  it('json_schema モードでは response_format を焼く', async () => {
    const fetchImpl = mockFetch(async () => ok(JSON.stringify(VALID)));
    const client = createNimLlmClient({ ...base(fetchImpl), structuredOutput: 'json_schema' });

    await client.complete(MESSAGES, agentResponseJsonSchema);
    const init = fetchImpl.mock.calls[0]![1];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema).toEqual(agentResponseJsonSchema);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.nvext).toBeUndefined();
  });

  it('コードフェンスや前後の散文が混じっても JSON を取り出す', async () => {
    const wrapped = 'はい。\n```json\n' + JSON.stringify(VALID) + '\n```\n以上です。';
    const client = createNimLlmClient(base(mockFetch(async () => ok(wrapped))));
    const res = await client.complete(MESSAGES, agentResponseJsonSchema);
    expect(res).toEqual(VALID);
  });

  it('malformed JSON は再試行し、直れば返す', async () => {
    const fetchImpl = mockFetch(async () => ok(JSON.stringify(VALID))).mockResolvedValueOnce(
      ok('壊れた {not json'),
    );
    const client = createNimLlmClient(base(fetchImpl));
    const res = await client.complete(MESSAGES, agentResponseJsonSchema);
    expect(res).toEqual(VALID);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('5xx は retriable として再試行、maxRetries を使い切ったら throw', async () => {
    const fetchImpl = mockFetch(async () => new Response('upstream', { status: 503 }));
    const client = createNimLlmClient({ ...base(fetchImpl), maxRetries: 2 });
    await expect(client.complete(MESSAGES, agentResponseJsonSchema)).rejects.toThrow(/HTTP 503/);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 初回 + 2 再試行
  });

  it('4xx は非 retriable として即時 throw（再試行しない）', async () => {
    const fetchImpl = mockFetch(async () => new Response('bad request', { status: 400 }));
    const client = createNimLlmClient({ ...base(fetchImpl), maxRetries: 2 });
    await expect(client.complete(MESSAGES, agentResponseJsonSchema)).rejects.toThrow(/HTTP 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('必須フィールド欠落（speech なし）は schema 強制で弾く（不変条件#3）', async () => {
    const bad = JSON.stringify({ observation: 'x', action: 'look' });
    const client = createNimLlmClient({ ...base(mockFetch(async () => ok(bad))), maxRetries: 0 });
    await expect(client.complete(MESSAGES, agentResponseJsonSchema)).rejects.toThrow(/AgentResponse/);
  });

  it('余剰キーも strict schema で弾く', async () => {
    const bad = JSON.stringify({ ...VALID, extra: 'nope' });
    const client = createNimLlmClient({ ...base(mockFetch(async () => ok(bad))), maxRetries: 0 });
    await expect(client.complete(MESSAGES, agentResponseJsonSchema)).rejects.toThrow(/AgentResponse/);
  });
});
