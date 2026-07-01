/**
 * dont-press-button / render-frame.ts — Tier B（ゲーム固有レンダー・docs/11 §2/§4）
 *
 * perceive() の兄弟。RawState → 「震えるボタンの固有の絵」。Tier A の汎用ビューアと違い、
 * このゲームだけの見た目（震え・ひび・追走・薄れ・落ち着き）を描いて「自作ゲーム感」を出す。
 *
 * 境界（docs/11 原則#1,#4,#5 を守る）：
 * - RawState を触るのは**ゲームパッケージ内のこの関数だけ**。core も AI も trace も RawState を持たない。
 *   Tier B は seed+action 列の**リプレイ**で state を再生して渡す（render-demo.ts）。決定論。
 * - renderFrame は独自のゲームロジック・乱数・遷移を持たない（state を読んで絵に写すだけ）。
 * - 画面に**数値・座標・スコア・技術語をテキストで出さない**。SVG の座標は描画命令であって表示テキスト
 *   ではない。可視テキストはボタン自身のダイジェティックな「おさないで」だけ（メカ語・数字なし）。
 */

import {
  COMPANION_GOAL,
  FADE_LIMIT,
  FRICTION_LIMIT,
  INSIST_MAX,
  PURSUIT_DEADEND,
  type DontPressButtonState,
} from './state.js';

export type ButtonMood = 'plead' | 'calm' | 'strain' | 'broken' | 'fade';

/**
 * ButtonFrame — 1 state の「絵の意味」。RawState の量を 0..1 の質に写した宣言的記述。
 * ここに RawState の変数名（insistence 等）は持ち込まない（絵の言葉に翻訳する）。
 */
export type ButtonFrame = {
  /** 震えの激しさ 0..1（訴えの強さ由来）。SVG の揺れ幅・速さに */
  tremble: number;
  /** ボタンの大きさ 0..1（存在感） */
  scale: number;
  /** 気配の濃さ（不透明度）0..1。薄れると下がる＝見失い */
  presence: number;
  /** 落ち着き 0..1。満ちへ。暖色のハロー */
  calm: number;
  /** 追ってくる度合い 0..1。手前へせり出す＝手詰まり方向 */
  chase: number;
  /** ざわつき 0..1。周りの落ち着かない印＝すれ違い方向 */
  restless: number;
  /** 押されてこわれたか。ひび割れ */
  cracked: boolean;
  /** 色ムード */
  mood: ButtonMood;
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** RawState → ButtonFrame（量→質。純粋・決定論） */
export function renderFrame(s: DontPressButtonState): ButtonFrame {
  const tremble = clamp01(s.insistence / INSIST_MAX);
  const calm = clamp01(s.companionship / COMPANION_GOAL);
  const chase = clamp01(s.pursuit / PURSUIT_DEADEND);
  const restless = clamp01(s.friction / FRICTION_LIMIT);
  const fade = clamp01(s.faded / FADE_LIMIT);
  const presence = s.pressed ? 0.55 : clamp01(1 - fade * 0.8);
  const scale = clamp01(
    0.58 + chase * 0.4 + tremble * 0.14 + calm * 0.1 - fade * 0.3 - (s.pressed ? 0.14 : 0),
  );

  const mood: ButtonMood = s.pressed
    ? 'broken'
    : fade >= 0.66
      ? 'fade'
      : calm >= 0.66
        ? 'calm'
        : chase >= 0.5 || restless >= 0.66
          ? 'strain'
          : 'plead';

  return { tremble, scale, presence, calm, chase, restless, cracked: s.pressed, mood };
}

type Palette = { bg0: string; bg1: string; body: string; edge: string; label: string; glow: string };

const PALETTE: Record<ButtonMood, Palette> = {
  plead: { bg0: '#141b2c', bg1: '#0a0d16', body: '#f2d9a8', edge: '#b7965f', label: '#6c5a3c', glow: '#ffb765' },
  calm: { bg0: '#2b2016', bg1: '#130f09', body: '#ffe6b0', edge: '#d8ab6a', label: '#7a6238', glow: '#ffcf87' },
  strain: { bg0: '#231433', bg1: '#0f0a1a', body: '#dcc6ff', edge: '#a98bff', label: '#5b4a86', glow: '#b28bff' },
  broken: { bg0: '#0d0d13', bg1: '#050508', body: '#8b8f98', edge: '#565a63', label: '#4a4e57', glow: '#6b7280' },
  fade: { bg0: '#0e1017', bg1: '#070810', body: '#c7ccd6', edge: '#7c828e', label: '#565b66', glow: '#9aa0a8' },
};

const CANVAS = { w: 1080, h: 1920, cx: 540, cy: 940 };

/**
 * ButtonFrame → SVG 文字列（9:16）。ブラウザで SMIL アニメが動く（震え・呼吸・薄れ）。
 * 可視テキストは「おさないで」のみ（数字・メカ語なし）。
 */
export function frameToSvg(frame: ButtonFrame): string {
  const p = PALETTE[frame.mood];
  const { w, h, cx, cy } = CANVAS;

  const capW = r2(560 * frame.scale);
  const capH = r2(300 * frame.scale);
  const rad = r2(64 * frame.scale);
  const depth = r2((frame.cracked ? 14 : 42) * frame.scale);
  const capX = r2(cx - capW / 2);
  const capY = r2(cy - capH / 2 + (frame.cracked ? depth * 0.6 : 0));

  // 震え：振幅は tremble 由来（落ち着くとほぼ 0）。速さも tremble で上がる。
  const amp = r2(3 + frame.tremble * 20);
  const dur = r2(0.16 - frame.tremble * 0.07);
  const trembleAnim =
    frame.tremble > 0.02
      ? `<animateTransform attributeName="transform" type="translate" additive="sum" ` +
        `values="0 0; ${amp} ${-r2(amp * 0.6)}; ${-amp} ${r2(amp * 0.5)}; ${r2(amp * 0.6)} ${amp}; 0 0" ` +
        `dur="${dur}s" repeatCount="indefinite"/>`
      : '';

  // 落ち着きのハロー（満ち）：暖色が呼吸する。
  const halo =
    frame.calm > 0.02
      ? `<circle cx="${cx}" cy="${cy}" r="${r2(capW * 0.95)}" fill="url(#glow)" opacity="${r2(frame.calm * 0.6)}">` +
        `<animate attributeName="opacity" values="${r2(frame.calm * 0.35)};${r2(frame.calm * 0.7)};${r2(frame.calm * 0.35)}" dur="3.4s" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="${r2(capW * 0.9)};${r2(capW * 1.02)};${r2(capW * 0.9)}" dur="3.4s" repeatCount="indefinite"/></circle>`
      : '';

  // 追走（手詰まり方向）：手前にせり出す影。
  const loom =
    frame.chase > 0.02
      ? `<ellipse cx="${cx}" cy="${r2(cy + capH * 0.5)}" rx="${r2(capW * (0.7 + frame.chase * 0.5))}" ry="${r2(capH * 0.5)}" ` +
        `fill="#000" opacity="${r2(frame.chase * 0.45)}"/>`
      : '';

  // ざわつき（すれ違い方向）：周囲の落ち着かない印が明滅。位置は固定（決定論・乱数なし）。
  const tickAngles = [18, 74, 138, 205, 262, 320];
  const ticks =
    frame.restless > 0.05
      ? tickAngles
          .map((deg, i) => {
            const rad0 = (deg * Math.PI) / 180;
            const rr = capW * 0.78;
            const x = r2(cx + Math.cos(rad0) * rr);
            const y = r2(cy + Math.sin(rad0) * rr);
            const beg = r2(i * 0.13);
            return (
              `<circle cx="${x}" cy="${y}" r="${r2(6 + frame.restless * 10)}" fill="${p.glow}" opacity="0">` +
              `<animate attributeName="opacity" values="0;${r2(frame.restless * 0.7)};0" dur="0.9s" begin="${beg}s" repeatCount="indefinite"/></circle>`
            );
          })
          .join('')
      : '';

  // ひび（こわれ）：固定の割れ線。
  const cracks = frame.cracked
    ? `<g stroke="${p.bg1}" stroke-width="6" opacity="0.75" fill="none">` +
      `<polyline points="${r2(cx - 40)},${r2(capY + 20)} ${cx},${r2(cy)} ${r2(cx - 20)},${r2(capY + capH - 24)}"/>` +
      `<polyline points="${cx},${r2(cy)} ${r2(cx + 70)},${r2(capY + 40)}"/>` +
      `<polyline points="${cx},${r2(cy)} ${r2(cx + 46)},${r2(capY + capH - 18)}"/></g>`
    : '';

  // 薄れ（見失い）：ボタン全体の不透明度が下がって明滅する。
  const fadeAnim =
    frame.mood === 'fade'
      ? `<animate attributeName="opacity" values="${r2(frame.presence)};${r2(frame.presence * 0.45)};${r2(frame.presence)}" dur="2.6s" repeatCount="indefinite"/>`
      : '';

  const labelOpacity = r2(frame.presence * (frame.mood === 'calm' ? 0.5 : frame.cracked ? 0.3 : 0.82));
  const labelSize = r2(52 * frame.scale);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">`,
    `<defs>`,
    `<radialGradient id="bg" cx="50%" cy="42%" r="80%"><stop offset="0%" stop-color="${p.bg0}"/><stop offset="100%" stop-color="${p.bg1}"/></radialGradient>`,
    `<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${p.glow}" stop-opacity="0.9"/><stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.body}"/><stop offset="100%" stop-color="${p.edge}"/></linearGradient>`,
    `</defs>`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>`,
    loom,
    halo,
    // ボタン本体（震えるグループ）。opacity=presence、薄れは明滅で表す。
    `<g opacity="${r2(frame.presence)}">${fadeAnim}`,
    `<g>${trembleAnim}`,
    // ソケット（下の受け）
    `<rect x="${capX}" y="${r2(capY + depth)}" width="${capW}" height="${capH}" rx="${rad}" fill="${p.edge}" opacity="0.7"/>`,
    // キャップ（押す面）
    `<rect x="${capX}" y="${capY}" width="${capW}" height="${capH}" rx="${rad}" fill="url(#cap)" stroke="${p.edge}" stroke-width="4"/>`,
    // ハイライト
    `<rect x="${r2(capX + 26)}" y="${r2(capY + 20)}" width="${r2(capW - 52)}" height="${r2(capH * 0.32)}" rx="${r2(rad * 0.7)}" fill="#ffffff" opacity="0.14"/>`,
    ticks,
    cracks,
    // ダイジェティックなラベル（数字・メカ語なし）
    `<text x="${cx}" y="${r2(capY + capH / 2 + labelSize * 0.34)}" text-anchor="middle" font-family="'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif" font-size="${labelSize}" letter-spacing="4" fill="${p.label}" opacity="${labelOpacity}">おさないで</text>`,
    `</g></g>`,
    `</svg>`,
  ].join('');
}

/** 1 コマ分の Tier B シーン（絵＋そのターンの発話＋局面） */
export type TierBScene = {
  svg: string;
  speech: string;
  closure: string;
  isClosing?: boolean;
};

const CLOSURE_GLOSS: Record<string, string> = {
  opening: 'はじまり',
  unfolding: 'ひらいている',
  closing: '閉じかけ',
};
const END_GLOSS: Record<string, string> = {
  terminal: '閉じた',
  deadend: '手詰まり',
  maxTurns: '醒めた',
  invalidAction: '—',
};

/**
 * Tier B ビューア HTML を組む（自作ゲーム固有の絵をコマ送り再生）。
 * SVG はオフラインでリプレイ再生済み（画面は DreamTrace のビュー・原則#1）。
 * 字幕は speech のみ（原則#5）。内部 enum は日本語グロスにする。
 */
export function buildTierBHtml(
  scenes: readonly TierBScene[],
  meta: { title: string; gameId: string; seed: number; endReason: string; hook?: string },
): string {
  const slides = scenes
    .map(
      (s, i) =>
        `<div class="slide" data-i="${i}">${s.svg}` +
        `<div class="badge">${s.isClosing ? END_GLOSS[meta.endReason] ?? '' : CLOSURE_GLOSS[s.closure] ?? ''}</div></div>`,
    )
    .join('\n');
  const speeches = JSON.stringify(scenes.map((s) => s.speech));
  const hook = meta.hook ? meta.hook : '';
  const titleLine = `${meta.title}（${meta.gameId}）seed=${meta.seed} — ${scenes.length}コマ / ${END_GLOSS[meta.endReason] ?? meta.endReason}`;

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tier B — ${meta.title}</title>
<style>
  html,body{margin:0;height:100%;background:#06070b;color:#e9ecf1;font-family:system-ui,"Noto Sans JP",sans-serif;}
  #app{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px;min-height:100%;}
  #stage{position:relative;aspect-ratio:9/16;height:min(84vh,860px);max-width:96vw;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.6);background:#000;}
  .slide{position:absolute;inset:0;display:none;}
  .slide.show{display:block;}
  .slide svg{width:100%;height:100%;display:block;}
  .badge{position:absolute;top:3%;right:4%;font-size:13px;letter-spacing:.12em;color:#c4c9d2;background:rgba(3,4,8,.5);padding:3px 12px;border-radius:999px;}
  .subtitle{position:absolute;left:0;right:0;bottom:0;padding:26px 8% 30px;text-align:center;font-size:20px;line-height:1.5;z-index:5;background:linear-gradient(180deg,transparent,rgba(0,0,0,.72) 42%);text-shadow:0 2px 10px #000;}
  .hookcard{position:absolute;inset:0;z-index:8;display:none;align-items:center;justify-content:center;text-align:center;padding:0 10%;background:radial-gradient(120% 90% at 50% 40%,rgba(10,12,20,.86),rgba(3,4,8,.96));font-size:24px;line-height:1.6;color:#f2e9db;text-shadow:0 2px 14px #000;cursor:pointer;}
  .hookcard.show{display:flex;}
  .controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;color:#c2c7d0;font-size:13px;}
  .controls button{background:#1a1e2a;color:#e9ecf1;border:1px solid #2b3040;border-radius:8px;padding:6px 12px;cursor:pointer;}
  .hint{color:#7c828e;font-size:12px;text-align:center;max-width:520px;}
</style></head>
<body><div id="app">
  <div id="stage">
    ${slides}
    <div class="subtitle" id="subtitle"></div>
    <div class="hookcard" id="hookcard">${hook}</div>
  </div>
  <div class="controls">
    <button id="prev">‹ 前</button><button id="play">▶ 再生</button><button id="next">次 ›</button>
    <span id="counter">— / —</span>
    <label>1コマ <input type="number" id="dur" value="2200" min="400" step="100" style="width:64px"> ms</label>
  </div>
  <div class="hint">${titleLine}<br/>Tier B：ゲーム固有の絵（seed+action のリプレイで決定論再生）。字幕は speech のみ。</div>
</div>
<script>
  const SP=${speeches}, HOOK=${JSON.stringify(hook)}, HOOK_MS=2000;
  const slides=[...document.querySelectorAll('.slide')], sub=document.getElementById('subtitle'),
        hookcard=document.getElementById('hookcard'), counter=document.getElementById('counter');
  let idx=0, playing=false, timer=null;
  function show(i){ idx=Math.max(0,Math.min(i,slides.length-1)); slides.forEach((s,k)=>s.classList.toggle('show',k===idx));
    sub.textContent=SP[idx]||''; counter.textContent=(idx+1)+' / '+slides.length; }
  function hideHook(){ hookcard.classList.remove('show'); }
  function step(d){ pause(); hideHook(); show(idx+d); }
  function pause(){ playing=false; clearTimeout(timer); document.getElementById('play').textContent='▶ 再生'; }
  function play(){ if(idx>=slides.length-1) show(0); playing=true; document.getElementById('play').textContent='⏸ 停止';
    const begin=()=>{ const tick=()=>{ if(!playing)return; if(idx>=slides.length-1){pause();return;} show(idx+1); timer=setTimeout(tick,Number(document.getElementById('dur').value)||2200); };
      timer=setTimeout(tick,Number(document.getElementById('dur').value)||2200); };
    if(idx===0&&HOOK){ hookcard.classList.add('show'); timer=setTimeout(()=>{hideHook();begin();},HOOK_MS);} else {hideHook();begin();} }
  document.getElementById('prev').onclick=()=>step(-1);
  document.getElementById('next').onclick=()=>step(1);
  document.getElementById('play').onclick=()=>playing?pause():play();
  hookcard.onclick=hideHook;
  show(0); if(HOOK) hookcard.classList.add('show');
</script></body></html>`;
}
