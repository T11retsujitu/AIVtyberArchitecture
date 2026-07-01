/**
 * dont-press-button / render-demo.ts — Tier B ビューアを書き出す（docs/11 §2/§8）
 *
 *   pnpm --filter @dream/dont-press-button build
 *   node packages/games/dont-press-button/dist/render-demo.js [arg]
 *
 * arg（省略時は press）：
 *   - takes/....json           … 既存 DreamTrace を読んで描く（Mode B+ で選んだ take）
 *   - press|hover|stepBack|lookAway|wait|cycle … その閉じ方のスクリプト take を生成して描く
 *   - <数値>                    … 決定論モック（そばで待つ＝満ち）を seed で生成して描く
 *
 * 描画は seed+action 列の**リプレイ**で RawState を再生 → renderFrame（docs/11 原則#4）。
 * 出力は out/<gameId>-seed<seed>.tierB.html（out/ は .gitignore）。
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClosingResponse, DreamTrace, LlmClient } from '@dream/core';
import { runAgentLoop, createActionValidator, createPromptBuilder } from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { dontPressButton } from './game.js';
import { renderFrame, frameToSvg, buildTierBHtml, type TierBScene } from './render-frame.js';
import type { DontPressButtonAction } from './state.js';

const SPEECH: Record<string, string> = {
  wait: '……押さないまま、そばに、いる。',
  press: 'ふぁ……押しちゃう、かも。',
  hover: '……手を、かざしてみる。',
  stepBack: 'ちょっと、離れてみる。',
  lookAway: '……目を、そらしてみる。',
};

/** 決められた action を返すスクリプト client（締めビートも返す＝閉じの一言が付く） */
function scriptClient(pick: (n: number) => DontPressButtonAction): LlmClient {
  let n = 0;
  return {
    async complete() {
      const action = pick(n++);
      return { observation: 'x', speech: SPEECH[action] ?? '……', action };
    },
    async closing(): Promise<ClosingResponse> {
      return { observation: 'x', speech: '……ふぁ、ここで、閉じるんだね。' };
    },
  };
}

function selectTake(arg: string | undefined): Promise<DreamTrace> {
  const deps = { prompt: createPromptBuilder(), validator: createActionValidator() };
  if (arg && arg.endsWith('.json')) {
    return Promise.resolve(JSON.parse(readFileSync(resolve(arg), 'utf8')) as DreamTrace);
  }
  const scripts: Record<string, (n: number) => DontPressButtonAction> = {
    wait: () => 'wait',
    press: () => 'press',
    hover: () => 'hover',
    stepBack: () => 'stepBack',
    lookAway: () => 'lookAway',
    cycle: (n) => (['wait', 'hover', 'stepBack', 'lookAway'] as const)[n % 4]!,
  };
  if (arg && scripts[arg]) {
    return runAgentLoop(dontPressButton, { llm: scriptClient(scripts[arg]!), ...deps }, { seed: 0 });
  }
  const seed = arg ? Number(arg) : 0;
  return runAgentLoop(dontPressButton, { llm: createMockLlmClient(), ...deps }, { seed });
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'press';
  const trace = await selectTake(arg);

  // seed+action 列のリプレイで各ターンの RawState を再生し、Tier B の絵にする。
  let state = dontPressButton.init(trace.seed);
  const scenes: TierBScene[] = [];
  for (const t of trace.turns) {
    scenes.push({ svg: frameToSvg(renderFrame(state)), speech: t.response.speech, closure: t.perception.closure });
    state = dontPressButton.apply(state, t.action as DontPressButtonAction).state;
  }
  // 締めビート（terminal/deadend/maxTurns の最終 state）
  if (trace.closing) {
    scenes.push({
      svg: frameToSvg(renderFrame(state)),
      speech: trace.closing.response.speech,
      closure: 'closing',
      isClosing: true,
    });
  }

  const html = buildTierBHtml(scenes, {
    title: trace.title,
    gameId: trace.gameId,
    seed: trace.seed,
    endReason: trace.endReason,
    ...(trace.hook !== undefined && { hook: trace.hook }),
  });

  const outDir = resolve(process.env.DREAM_OUT_DIR ?? './out');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${trace.gameId}-seed${trace.seed}-${trace.endReason}.tierB.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`Tier B → ${outPath}（${scenes.length} コマ / ${trace.endReason}）`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
