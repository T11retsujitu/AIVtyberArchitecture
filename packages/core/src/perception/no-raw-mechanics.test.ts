import { describe, expect, it } from 'vitest';
import type { AIChanPerception } from './schema.js';
import {
  assertNoRawMechanics,
  assertNoRawMechanicsText,
  findRawMechanics,
  findRawMechanicsInText,
} from './no-raw-mechanics.js';

/** 合格すべき描写のみで構成した perception（praise-room 想定） */
const clean: AIChanPerception = {
  turn: 2,
  scene: {
    summary: '目の前に、ぼやけた部屋がひとつ。やわらかい光が満ちている',
    elements: [
      { ref: 'light-1', description: 'あったかい光が、こっちを見ている気がする', salience: 'vivid' },
      { ref: 'shadow-1', description: '隅にうっすらと影', salience: 'faint' },
    ],
  },
  affordances: [
    { action: 'touch', label: 'そっと触れてみる' },
    { action: 'wait', label: '少し待ってみる', hint: 'まだ、こっちを見てる気がする' },
  ],
  feedback: [{ description: '手応えが続いている', valence: 'good' }],
  closure: 'unfolding',
};

describe('findRawMechanics', () => {
  it('正常な描写には違反を検出しない', () => {
    expect(findRawMechanics(clean)).toEqual([]);
  });

  it('ref / action が数字を含んでも誤検知しない', () => {
    // shadow-1 / light-1 は機械IDなので検査対象外
    expect(findRawMechanics(clean)).toEqual([]);
  });

  it.each([
    ['座標タプル', '敵が(3,4)にいる'],
    ['ピクセル', '影が12px右にずれた'],
    ['秒（日本語）', 'あと3秒で閉じる'],
    ['秒（英）', '残り3.2sで消える'],
    ['エンジン変数', 'score=80 まで上がった'],
    ['HP代入', 'hp:3 になった'],
  ])('%s を含む summary を弾く', (_name, summary) => {
    const p: AIChanPerception = { ...clean, scene: { ...clean.scene, summary } };
    expect(findRawMechanics(p).length).toBeGreaterThan(0);
  });

  it('「stars」のような語中の数字+sは誤検知しない', () => {
    const p: AIChanPerception = {
      ...clean,
      scene: { ...clean.scene, summary: '12 stars が空に浮かんでいる' },
    };
    expect(findRawMechanics(p)).toEqual([]);
  });
});

describe('assertNoRawMechanics', () => {
  it('合格時は例外を投げない', () => {
    expect(() => assertNoRawMechanics(clean)).not.toThrow();
  });

  it('違反時は docs/07 を案内する例外を投げる', () => {
    const p: AIChanPerception = {
      ...clean,
      feedback: [{ description: 'remaining=12 だった', valence: 'strange' }],
    };
    expect(() => assertNoRawMechanics(p)).toThrow(/不変条件 #1/);
  });
});

describe('assertNoRawMechanicsText（GameMeta.hook 等の公開文言ゲート）', () => {
  it('クリーンなフック文言は通す', () => {
    expect(() => assertNoRawMechanicsText('褒めてくる光を、AIちゃんは受け入れられるのか。', 'hook')).not.toThrow();
  });

  it.each([
    ['座標', '(3,4) の光を追う'],
    ['ピクセル', '12px 右にずれる夢'],
    ['秒', 'あと3秒の夢'],
    ['エンジン変数', 'score=80 の夢'],
  ])('%s を含むフック文言を弾く', (_name, hook) => {
    expect(() => assertNoRawMechanicsText(hook, 'hook')).toThrow(/不変条件 #1/);
    expect(findRawMechanicsInText(hook).length).toBeGreaterThan(0);
  });
});
