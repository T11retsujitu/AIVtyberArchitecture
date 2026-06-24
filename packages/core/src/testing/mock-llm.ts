/**
 * testing/mock-llm.ts — ネット不要・決定論の LlmClient（縦通し検証用）
 *
 * 本物の LLM プロバイダ（Anthropic 等）の差し替え先と同じ LlmClient 契約を満たす。
 * messages にレンダリングされた perception から「できること」を読み取り、
 * AIちゃんらしい素朴な方針で 1 つ選ぶ。出力は AgentResponse の形を必ず満たす。
 *
 * 目的は契約の縦通し（perceive→llm→apply）を鍵なしで再現性込みで回すこと。
 * セリフの質は本物の LLM が担う。ここは決定論の足場。
 */

import type { AgentResponse } from '../agent/response-schema.js';
import { AgentResponseSchema } from '../agent/response-schema.js';
import type { ChatMessage, LlmClient } from '../agent/types.js';

/** 行動 id ごとの、眠そうで生真面目なセリフ素片 */
const SPEECH: Record<string, string> = {
  look: '……なんだろう、あれ。すこし、見てみる。',
  wait: 'ふぁ……もう少し、待ってみる、かも。',
  touch: 'あったかい……そっと、触れてみる。',
  withdraw: 'ちょっと、こわいかも。……離れる。',
};

function lastUserContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') return m.content;
  }
  return '';
}

/** レンダリング済み perception から [action] トークンを抽出（出現順） */
function parseActions(content: string): string[] {
  const out: string[] = [];
  const re = /\[([a-z][a-z-]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const a = m[1];
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * 素朴な方針：
 * - 光がまだ「かすか」なら、まず見てみる（look）。
 * - 「はっきり」「つよく」感じるなら、触れてみる（touch）。
 * - それ以外は、提示された最初の候補を選ぶ。
 * いずれも affordances に含まれる action だけを返す（語彙外を作らない）。
 */
function chooseAction(content: string, actions: string[]): string {
  const feelsClose = content.includes('はっきり') || content.includes('つよく');
  const feelsFaint = content.includes('かすか');

  if (feelsClose && actions.includes('touch')) return 'touch';
  if (feelsFaint && actions.includes('look')) return 'look';
  if (actions.includes('look')) return 'look';
  return actions[0] ?? '';
}

export function createMockLlmClient(): LlmClient {
  return {
    async complete(messages: ChatMessage[]): Promise<AgentResponse> {
      const content = lastUserContent(messages);
      const actions = parseActions(content);
      const action = chooseAction(content, actions);

      const speech = SPEECH[action] ?? '……よく、わからないけど。そっとしておく。';
      const observation = `見えているものに気を向けた。選んだのは「${action}」。`;

      // 本物のクライアントと同じく、返す前に必ずスキーマを通す（不変条件 #3）。
      return AgentResponseSchema.parse({ observation, speech, action });
    },
  };
}
