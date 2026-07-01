/**
 * @dream/dont-press-button — 公開第1作の DreamGame
 */

export { dontPressButton } from './game.js';
export type { DontPressButtonState, DontPressButtonAction } from './game.js';
export { DONT_PRESS_ACTIONS } from './state.js';

// Tier B（ゲーム固有レンダー・docs/11 §2）。RawState → 震えるボタンの絵。
export { renderFrame, frameToSvg, buildTierBHtml } from './render-frame.js';
export type { ButtonFrame, ButtonMood, TierBScene } from './render-frame.js';
