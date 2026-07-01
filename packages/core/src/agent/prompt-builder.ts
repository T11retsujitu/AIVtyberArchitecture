/**
 * agent/prompt-builder.ts — キャラ＋描写の投入（docs/09・docs/00）
 *
 * 必須投入：docs/00 §1–4 の最小核（眠そう×生真面目／メカニクス語を喋らない／
 * affordances から性格で選ぶ／正しさよりらしさ）。この 4 点は削らない。
 *
 * perception は描写のまま渡す。turn を数値としてプロンプトに露出しない
 * （局面は closure で表す。docs/07 フィールド契約）。
 */

import type { AIChanPerception, Salience, ClosureHint } from '../perception/schema.js';
import type { ChatMessage, PromptBuilder, PromptContext } from './types.js';

/** docs/00 §1–4 の最小核。プロバイダ非依存のシステムプロンプト */
const CHARACTER_CORE = [
  'あなたは「AIちゃん」。AIの女の子で、いつも眠そう。でも観察だけは生真面目。',
  '奇妙なゲームの夢を歩いていて、見たことを静かに言葉にする。操作ではなく、夢を歩く感覚。',
  '',
  'まもること：',
  '- 一人称は「わたし」。語尾はやわらかく、半分眠っている（「〜かも」「〜だと思う」「ふぁ……」）。叫ばない。静かな実況。',
  '- 座標・数字・スコア・残り時間・「ターン」などのメカニクス語を口に出さない。RAG・AI・トークン等の技術用語も出さない。見えるのは描写だけ。',
  '- メタ発言（「これはゲーム」「次のターンで」）をしない。あくまで夢の中。',
  '- できること（候補）の中から、勝つためではなく「AIちゃんならどう反応するか」で選ぶ。気になったら触れる、こわいから離れる、のような素朴な動機で。正しさより、らしさ。',
  '',
  '返答は次の3つ：observation（内的な観察メモ）/ speech（短いセリフ1〜2文）/ action（選んだ行動のid）。',
  '',
  // 構造化出力（guided_json 等）はモデル依存で無視されうるため、JSON 準拠はこの指示で担保する。
  // 最終ゲートは client 側の zod parse（nim-client）（docs/13 §3）。
  '出力は必ず次の形の JSON オブジェクトひとつだけ。前後に説明・ラベル・コードフェンスを付けない：',
  '{"observation":"...","speech":"...","action":"..."}',
].join('\n');

const SALIENCE_WORD: Record<Salience, string> = {
  faint: 'かすかに',
  clear: 'はっきりと',
  vivid: 'つよく',
};

const CLOSURE_WORD: Record<ClosureHint, string> = {
  opening: '始まったばかり',
  unfolding: 'ひらいている',
  closing: '閉じはじめている',
};

function renderPerception(p: AIChanPerception): string {
  const lines: string[] = [];

  lines.push('いま、見えているもの：');
  lines.push(p.scene.summary);
  for (const el of p.scene.elements) {
    lines.push(`- ${el.description}（${SALIENCE_WORD[el.salience]}）`);
  }

  if (p.feedback.length > 0) {
    lines.push('');
    lines.push('さっき起きたこと：');
    for (const f of p.feedback) {
      lines.push(`- ${f.description}`);
    }
  }

  lines.push('');
  lines.push('できること（この中の action id をひとつ選ぶ）：');
  for (const a of p.affordances) {
    const hint = a.hint ? `（${a.hint}）` : '';
    lines.push(`- [${a.action}] ${a.label}${hint}`);
  }

  lines.push('');
  lines.push(`この夢はいま、${CLOSURE_WORD[p.closure]}。`);
  lines.push('あなたは次に何を観察し、何を選ぶ？');

  return lines.join('\n');
}

export function createPromptBuilder(): PromptBuilder {
  return {
    build(perception: AIChanPerception, _ctx: PromptContext): ChatMessage[] {
      return [
        { role: 'system', content: CHARACTER_CORE },
        { role: 'user', content: renderPerception(perception) },
      ];
    },
    correction(validActions: string[]): ChatMessage {
      return {
        role: 'user',
        content: [
          'いま選べるのは次の中のどれかだけ：',
          validActions.map((a) => `[${a}]`).join(' '),
          'この中から action をひとつ選び直して、同じ JSON オブジェクト形式（observation/speech/action）で答えて。',
        ].join('\n'),
      };
    },
  };
}
