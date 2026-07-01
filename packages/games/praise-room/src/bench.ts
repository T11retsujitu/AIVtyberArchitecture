/**
 * bench.ts — NIM モデル比較（docs/13 §4）
 *
 * Mode A（既定・固定入力）:
 *   決定論モックで perception 列を 1 本作り、その「同じ場面」に各モデルの complete() を当てて
 *   speech/observation を横並べする。言語（日本語トーン）の質を純粋比較する。
 *   report → takes/bench-A-seed<seed>.json
 *
 * Mode B（フルtake）:
 *   各モデルに実際にプレイさせ、take を takes/<model>-seed<seed>.json に書き出す。
 *   Tier A ビューアで通し目視（行動選択込みの“作品”差）。
 *
 *   NIM_MODELS="qwen/qwen2.5-72b-instruct,meta/llama-3.3-70b-instruct" \
 *     node packages/games/praise-room/dist/bench.js A 42
 *   NIM_MODELS="..." node packages/games/praise-room/dist/bench.js B 42
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AIChanPerception, LlmClient } from '@dream/core';
import {
  runAgentLoop,
  createActionValidator,
  createPromptBuilder,
  createNimLlmClient,
  agentResponseJsonSchema,
} from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { praiseRoom } from './game.js';
import { nimConfigForModel } from './nim-env.js';

function parseModels(): string[] {
  const raw = process.env.NIM_MODELS ?? '';
  const models = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (models.length === 0) {
    throw new Error('NIM_MODELS が未設定です（比較するモデル id をカンマ区切りで・docs/13 §4）');
  }
  return models;
}

function parseSeed(): number {
  const arg = process.argv[3] ?? process.env.DREAM_SEED;
  const seed = arg ? Number(arg) : 1;
  if (!Number.isFinite(seed)) throw new Error(`seed が数値ではありません: ${String(arg)}`);
  return seed;
}

function outDir(): string {
  const dir = resolve(process.env.DREAM_TAKE_OUT_DIR ?? './takes');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const safe = (model: string): string => model.replace(/[^\w.-]+/g, '__');

type CellA = { speech: string; observation: string; action: string } | { error: string };

/** Mode A：固定 perception 列に各モデルのセリフを当てて横並べ */
async function modeA(models: string[], seed: number): Promise<void> {
  const prompt = createPromptBuilder();

  // 参照 perception 列を決定論モックで 1 本作る（毎回同じ場面）
  const ref = await runAgentLoop(
    praiseRoom,
    { llm: createMockLlmClient(), prompt, validator: createActionValidator() },
    { seed },
  );
  const perceptions: AIChanPerception[] = ref.turns.map((t) => t.perception);
  console.log(`\n=== Mode A（固定入力比較）seed=${seed} / ${perceptions.length} 場面 / ${models.length} モデル ===`);

  const byModel = new Map<string, CellA[]>();
  for (const model of models) {
    const client = createNimLlmClient(nimConfigForModel(model));
    const cells: CellA[] = [];
    for (const p of perceptions) {
      const messages = prompt.build(p, { title: ref.title });
      try {
        const r = await client.complete(messages, agentResponseJsonSchema);
        cells.push({ speech: r.speech, observation: r.observation, action: r.action });
      } catch (err) {
        cells.push({ error: String(err) });
      }
    }
    byModel.set(model, cells);
  }

  // 場面ごとに各モデルのセリフを並べて表示
  perceptions.forEach((p, i) => {
    console.log(`\n[${p.closure}] ${p.scene.summary}`);
    for (const model of models) {
      const cell = byModel.get(model)?.[i];
      if (!cell) continue;
      if ('error' in cell) console.log(`  ${model}: ⚠ ${cell.error.slice(0, 120)}`);
      else console.log(`  ${model}: 「${cell.speech}」→ ${cell.action}`);
    }
  });

  const report = {
    mode: 'A',
    seed,
    title: ref.title,
    gameId: ref.gameId,
    perceptions,
    results: models.map((model) => ({ model, cells: byModel.get(model) ?? [] })),
  };
  const outPath = resolve(outDir(), `bench-A-seed${seed}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nreport → ${outPath}\n`);
}

/** Mode B：各モデルにプレイさせて take を書き出す */
async function modeB(models: string[], seed: number): Promise<void> {
  const prompt = createPromptBuilder();
  console.log(`\n=== Mode B（フルtake）seed=${seed} / ${models.length} モデル ===`);

  for (const model of models) {
    const cfg = nimConfigForModel(model);
    const client: LlmClient = createNimLlmClient(cfg);
    let outPath = '';
    try {
      const trace = await runAgentLoop(
        praiseRoom,
        { llm: client, prompt, validator: createActionValidator() },
        {
          seed,
          provenance: {
            runId: randomUUID(),
            createdAt: new Date().toISOString(),
            model: { provider: 'nim', name: model, params: { temperature: cfg.temperature ?? 0.8 } },
            promptVersion: 'prompt/0.1',
            characterBibleVersion: 'character-bible/0.1',
            gameVersion: '0.0.0',
          },
        },
      );
      outPath = resolve(outDir(), `${safe(model)}-seed${seed}.json`);
      writeFileSync(outPath, JSON.stringify(trace, null, 2), 'utf8');
      console.log(`\n--- ${model}：${trace.endReason} / ${trace.turns.length} ターン ---`);
      for (const t of trace.turns) console.log(`  「${t.response.speech}」→ ${t.action}`);
      console.log(`  take → ${outPath}`);
    } catch (err) {
      console.log(`\n--- ${model}：⚠ 失敗 ${String(err).slice(0, 200)} ---`);
    }
  }
  console.log(`\nビューアで見る: pnpm --filter @dream/render serve → ?src=/takes/<model>-seed${seed}.json\n`);
}

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? 'A').toUpperCase();
  const models = parseModels();
  const seed = parseSeed();
  if (mode === 'B') await modeB(models, seed);
  else await modeA(models, seed);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
