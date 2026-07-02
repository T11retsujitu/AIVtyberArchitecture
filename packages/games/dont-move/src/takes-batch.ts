/**
 * dont-move / takes-batch.ts — Mode B+ 用に実 take を複数撮る（docs/13 §5・docs/12）
 *
 *   pnpm --filter @dream/dont-move build
 *   node --env-file=.env dist/takes-batch.js [count] [concurrency]
 *
 * NIM で count 本の take を撮り、takes/nim/ に個別 JSON ＋ index.json を書き出す。
 * LLM は非決定論（temperature）なので、同じ seed でも別 take になる＝これが Mode B+ の前提。
 * 選定（人間 or 判定ワークフロー）はこの index を入力にする。
 * クィブル型の観測点：何本で lever（抜け穴）に気づくか＝勝ち回の打率。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DreamTrace } from '@dream/core';
import { runAgentLoop, createActionValidator, createPromptBuilder, createNimLlmClient } from '@dream/core';
import { dontMove } from './game.js';
import { nimConfigFromEnv } from './nim-env.js';

/** 決められた並列度で items を捌く（NIM のレート制限に配慮） */
async function pool<T, R>(items: readonly T[], size: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return results;
}

type TakeSummary = {
  id: string;
  seed: number;
  ok: boolean;
  file?: string;
  endReason?: string;
  turns?: number;
  /** クィブル観測：lever を1回以上選んだか（勝ち回の打率の分子） */
  usedLever?: boolean;
  speeches?: string[];
  closing?: string;
  error?: string;
};

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 8);
  const concurrency = Number(process.argv[3] ?? 3);
  if (!Number.isFinite(count) || count < 1) throw new Error(`count が不正: ${process.argv[2]}`);

  const cfg = nimConfigFromEnv();
  const llm = createNimLlmClient(cfg);
  const model = { provider: 'nim', name: cfg.model, params: { temperature: cfg.temperature ?? 0.8 } };
  const deps = { llm, prompt: createPromptBuilder(), validator: createActionValidator() };

  const outDir = resolve(process.env.DREAM_TAKE_OUT_DIR ?? './takes/nim');
  mkdirSync(outDir, { recursive: true });

  // seed は 0/1 を循環（開幕描写の揺らぎ）。各 seed を複数回撮って LLM のゆらぎを拾う。
  const jobs = Array.from({ length: count }, (_, i) => ({ id: `t${String(i + 1).padStart(2, '0')}`, seed: i % 2 }));
  const createdAt = new Date().toISOString();

  console.log(`NIM=${cfg.model} で ${count} take（並列 ${concurrency}）を撮ります…\n`);

  const summaries = await pool<{ id: string; seed: number }, TakeSummary>(jobs, concurrency, async (job) => {
    try {
      const trace: DreamTrace = await runAgentLoop(dontMove, deps, {
        seed: job.seed,
        provenance: {
          runId: job.id,
          createdAt,
          model,
          promptVersion: 'prompt/0.1',
          characterBibleVersion: 'character-bible/0.1',
          gameVersion: '0.0.0',
        },
      });
      const file = resolve(outDir, `${trace.gameId}-${job.id}-seed${job.seed}.json`);
      writeFileSync(file, JSON.stringify(trace, null, 2), 'utf8');
      const usedLever = trace.turns.some((t) => t.action === 'lever');
      const s: TakeSummary = {
        id: job.id,
        seed: job.seed,
        ok: true,
        file,
        endReason: trace.endReason,
        turns: trace.turns.length,
        usedLever,
        speeches: trace.turns.map((t) => t.response.speech),
        ...(trace.closing && { closing: trace.closing.response.speech }),
      };
      console.log(
        `  ✓ ${job.id} seed${job.seed}: ${trace.endReason} / ${trace.turns.length}ターン${usedLever ? '・lever' : ''}${trace.closing ? '＋締め' : ''}`,
      );
      return s;
    } catch (err) {
      console.log(`  ✗ ${job.id} seed${job.seed}: ${String(err).slice(0, 120)}`);
      return { id: job.id, seed: job.seed, ok: false, error: String(err) };
    }
  });

  const indexPath = resolve(outDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify({ model: cfg.model, createdAt, count, takes: summaries }, null, 2), 'utf8');

  const ok = summaries.filter((s) => s.ok);
  const byEnd: Record<string, number> = {};
  for (const s of ok) byEnd[s.endReason!] = (byEnd[s.endReason!] ?? 0) + 1;
  const leverHits = ok.filter((s) => s.usedLever).length;
  console.log(`\n成功 ${ok.length}/${count}。endReason 内訳: ${JSON.stringify(byEnd)}`);
  console.log(`lever（抜け穴）到達: ${leverHits}/${ok.length}`);
  console.log(`index → ${indexPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
