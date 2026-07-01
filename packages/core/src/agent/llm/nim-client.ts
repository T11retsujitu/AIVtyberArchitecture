/**
 * agent/llm/nim-client.ts — NVIDIA NIM の LlmClient 実装（docs/13）
 *
 * NIM は OpenAI 互換（POST {baseUrl}/chat/completions）。structured output を強制して
 * AgentResponse を返す（不変条件#3）。形が壊れた応答はここで例外にする（語彙外 action は
 * ここではなく action-validator の責務・docs/09）。
 *
 * 依存を増やさないため OpenAI SDK は使わず素の fetch。テストは fetchImpl 注入でネット不要。
 * 鍵/URL の局所化点はこの client（env の読み取りは呼び出し側＝nim-env.ts）。
 */

import { AgentResponseSchema, ClosingResponseSchema } from '../response-schema.js';
import type { AgentResponse, ClosingResponse } from '../response-schema.js';
import type { ChatMessage, LlmClient } from '../types.js';

type FetchLike = typeof fetch;

/** 構造化出力の経路。既定は NVIDIA 推奨の guided_json（docs/13 §3） */
export type StructuredOutputMode = 'guided_json' | 'json_schema';

export type NimClientConfig = {
  /** nvapi-... （必須） */
  apiKey: string;
  /** モデル id（例 qwen/qwen2.5-72b-instruct）（必須） */
  model: string;
  /** 既定 https://integrate.api.nvidia.com/v1 */
  baseUrl?: string;
  /** 既定 0.8（キャラの揺らぎ・docs/00 §3-3） */
  temperature?: number;
  /** 既定 512 */
  maxTokens?: number;
  topP?: number;
  /** 再現性を上げるためのサンプリング seed（任意・NIM/vLLM 対応） */
  seed?: number;
  /** 既定 'guided_json' */
  structuredOutput?: StructuredOutputMode;
  /** transient（ネットワーク/429/5xx/malformed）の再試行回数。既定 2 */
  maxRetries?: number;
  /** 再試行の待ち（ms）。attempt に比例。既定 250（テストは 0） */
  retryBackoffMs?: number;
  /** テスト用に fetch を差し替える */
  fetchImpl?: FetchLike;
};

/** retriable フラグ付きのエラー（再試行判定用） */
class NimError extends Error {
  readonly retriable: boolean;
  constructor(message: string, retriable: boolean) {
    super(message);
    this.name = 'NimError';
    this.retriable = retriable;
  }
}

/** LLM 応答本文から JSON オブジェクトを取り出す（コードフェンス/前後の散文に耐える） */
function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? content;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createNimLlmClient(config: NimClientConfig): LlmClient {
  const baseUrl = (config.baseUrl ?? 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const temperature = config.temperature ?? 0.8;
  const maxTokens = config.maxTokens ?? 512;
  const mode: StructuredOutputMode = config.structuredOutput ?? 'guided_json';
  const maxRetries = config.maxRetries ?? 2;
  const backoffMs = config.retryBackoffMs ?? 250;
  const doFetch: FetchLike = config.fetchImpl ?? fetch;

  /**
   * 構造化出力の共通経路（complete / closing が共有）。schema を body に焼き、応答本文から
   * JSON を取り出し、渡された safeParse で最終強制する（不変条件#3）。transient は再試行。
   * complete と closing は「どの JSON Schema を焼くか」と「どの zod で parse するか」だけが違う。
   */
  async function requestStructured<T>(
    messages: ChatMessage[],
    schema: unknown,
    schemaName: string,
    safeParse: (u: unknown) => { success: true; data: T } | { success: false; error: { message: string } },
    label: string,
  ): Promise<T> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };
    if (config.topP !== undefined) body.top_p = config.topP;
    if (config.seed !== undefined) body.seed = config.seed;
    // structured output の強制（不変条件#3）
    if (mode === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: schemaName, schema, strict: true },
      };
    } else {
      body.nvext = { guided_json: schema };
    }

    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    };

    const attemptOnce = async (): Promise<T> => {
      let res: Response;
      try {
        res = await doFetch(url, init);
      } catch (err) {
        throw new NimError(`NIM への接続に失敗: ${String(err)}`, true);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const retriable = res.status === 429 || res.status >= 500;
        throw new NimError(`NIM HTTP ${res.status}: ${text.slice(0, 300)}`, retriable);
      }
      const data = (await res.json().catch(() => null)) as
        | { choices?: Array<{ message?: { content?: unknown } }> }
        | null;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new NimError('NIM 応答に本文（choices[0].message.content）がない', true);
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(extractJsonObject(content));
      } catch {
        throw new NimError(`NIM 応答が JSON として壊れている: ${content.slice(0, 200)}`, true);
      }
      // 構造の最終強制（不変条件#3）。必須欠落/空文字はここで弾く。
      const result = safeParse(parsedJson);
      if (!result.success) {
        throw new NimError(`${label} の形が不正: ${result.error.message.slice(0, 200)}`, true);
      }
      return result.data;
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await attemptOnce();
      } catch (err) {
        lastError = err;
        const retriable = err instanceof NimError && err.retriable;
        if (retriable && attempt < maxRetries) {
          if (backoffMs > 0) await sleep(backoffMs * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    // ループは必ず return か throw で抜けるが、TS の網羅のため。
    throw lastError instanceof Error ? lastError : new Error('NIM: 不明なエラー');
  }

  return {
    async complete(messages: ChatMessage[], schema): Promise<AgentResponse> {
      return requestStructured(
        messages,
        schema,
        'agent_response',
        (u) => AgentResponseSchema.safeParse(u),
        'AgentResponse',
      );
    },

    async closing(messages: ChatMessage[], schema): Promise<ClosingResponse> {
      // ClosingResponse は .strict() ではないので、余剰 action 等は strip されて observation/speech を採用する
      // （締めは best-effort・docs/09。サーバ側構造化が効かないモデル対策）。
      return requestStructured(
        messages,
        schema,
        'closing_response',
        (u) => ClosingResponseSchema.safeParse(u),
        'ClosingResponse',
      );
    },
  };
}
