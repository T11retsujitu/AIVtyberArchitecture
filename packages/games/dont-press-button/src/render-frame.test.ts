/**
 * render-frame.test.ts — Tier B レンダー（docs/11 §2）
 *
 * 見るもの：量→質の写像が正しいか、決定論か、そして境界——SVG の**可視テキスト**に
 * 生メカ数値や内部変数名が出ていないこと（原則#1/#5）。SVG の座標属性は描画命令なので対象外。
 */

import { describe, expect, it } from 'vitest';
import { assertNoRawMechanicsText } from '@dream/core';
import { renderFrame, frameToSvg, buildTierBHtml, type TierBScene } from './render-frame.js';
import {
  COMPANION_GOAL,
  FADE_LIMIT,
  FRICTION_LIMIT,
  INSIST_MAX,
  PURSUIT_DEADEND,
  type DontPressButtonState,
} from './state.js';

const base: DontPressButtonState = {
  seed: 0,
  turn: 1,
  insistence: 1,
  companionship: 0,
  friction: 0,
  pursuit: 0,
  faded: 0,
  pressed: false,
  lastKind: null,
};

describe('renderFrame（量→質）', () => {
  it('決定論：同じ state → 同じ frame', () => {
    expect(renderFrame(base)).toEqual(renderFrame({ ...base }));
  });

  it('入り（訴えは浅い）は plead', () => {
    expect(renderFrame(base).mood).toBe('plead');
  });

  it('押されたら broken＋ひび', () => {
    const f = renderFrame({ ...base, pressed: true });
    expect(f.mood).toBe('broken');
    expect(f.cracked).toBe(true);
  });

  it('そばで満ちると calm（落ち着き最大）', () => {
    const f = renderFrame({ ...base, companionship: COMPANION_GOAL });
    expect(f.mood).toBe('calm');
    expect(f.calm).toBe(1);
  });

  it('薄れると fade（気配＝presence が下がる）', () => {
    const f = renderFrame({ ...base, faded: FADE_LIMIT });
    expect(f.mood).toBe('fade');
    expect(f.presence).toBeLessThan(0.3);
  });

  it('追われると chase 最大（せり出す）', () => {
    const f = renderFrame({ ...base, pursuit: PURSUIT_DEADEND });
    expect(f.chase).toBe(1);
  });

  it('噛み合わないと restless 最大', () => {
    expect(renderFrame({ ...base, friction: FRICTION_LIMIT }).restless).toBe(1);
  });

  it('激しく震えると tremble 最大', () => {
    expect(renderFrame({ ...base, insistence: INSIST_MAX }).tremble).toBe(1);
  });
});

/** SVG の <text>…</text> の中身だけを抜き出す */
function svgTexts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? '');
}

describe('frameToSvg（境界：可視テキストに生メカ数値・内部語なし）', () => {
  const svgs = [
    frameToSvg(renderFrame(base)),
    frameToSvg(renderFrame({ ...base, pressed: true })),
    frameToSvg(renderFrame({ ...base, companionship: COMPANION_GOAL })),
    frameToSvg(renderFrame({ ...base, faded: FADE_LIMIT })),
    frameToSvg(renderFrame({ ...base, pursuit: PURSUIT_DEADEND, friction: FRICTION_LIMIT })),
  ];

  it('9:16 の SVG を返す', () => {
    expect(svgs[0]!.startsWith('<svg')).toBe(true);
    expect(svgs[0]!).toContain('viewBox="0 0 1080 1920"');
  });

  it('可視テキストはダイジェティックな「おさないで」だけで、生メカ数値を含まない（#1）', () => {
    for (const svg of svgs) {
      const texts = svgTexts(svg);
      for (const t of texts) {
        expect(t).toBe('おさないで');
        expect(() => assertNoRawMechanicsText(t, 'tierB-text')).not.toThrow();
      }
    }
  });

  it('SVG に内部変数名（insistence/pursuit 等）が文字列として出ない', () => {
    for (const svg of svgs) {
      for (const name of ['insistence', 'companionship', 'friction', 'pursuit', 'faded', 'pressed']) {
        expect(svg.includes(name)).toBe(false);
      }
    }
  });

  it('状態でモチーフが変わる（こわれはひび、満ちはハロー）', () => {
    expect(svgs[1]!).toContain('polyline'); // ひび（cracked）
    expect(svgs[2]!).toContain('url(#glow)'); // 落ち着きのハロー（calm）
  });
});

describe('buildTierBHtml', () => {
  it('コマ数ぶんの slide と、字幕（speech）とフックを埋める', () => {
    const scenes: TierBScene[] = [
      { svg: '<svg/>', speech: 'ひとつめ', closure: 'opening' },
      { svg: '<svg/>', speech: 'しめ', closure: 'closing', isClosing: true },
    ];
    const html = buildTierBHtml(scenes, {
      title: 't',
      gameId: 'g',
      seed: 0,
      endReason: 'terminal',
      hook: 'へんな問い',
    });
    expect(html).toContain('data-i="0"');
    expect(html).toContain('data-i="1"');
    expect(html).toContain('ひとつめ');
    expect(html).toContain('へんな問い');
  });
});
