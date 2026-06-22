/**
 * perception/schema.ts — AIChanPerception
 *
 * 規範は docs/07-perception-schema.md。食い違ったら doc を正とする。
 *
 * 不変条件 #1：このスキーマのいかなるフィールドにも、座標・ピクセル・タイマー秒・
 * 生のスコア/HP/内部カウンタを「生で」入れてはならない。量ではなく質で渡す。
 * （faint/clear/vivid、good/bad/neutral/strange、opening/unfolding/closing）
 */

/** 注意の引き方。距離や数の代理に使ってよいが、数値は出さない */
export type Salience = 'faint' | 'clear' | 'vivid';

/** 質的評価のみ。数値の増減は渡さない */
export type Valence = 'good' | 'bad' | 'neutral' | 'strange';

/** 夢の局面。タイマー秒の代わりに「閉じ」を匂わせる */
export type ClosureHint = 'opening' | 'unfolding' | 'closing';

/** シーンの個別要素。座標を持たない */
export type SceneElement = {
  /** 安定参照ID。座標ではなく同一性。ターンをまたいで同じ対象には同じ ref */
  ref: string;
  /** 描写。メカニクス語を含めない */
  description: string;
  salience: Salience;
};

/** 今見えているものの描写 */
export type Scene = {
  /** 一文での全体描写。空文字禁止・メカニクス語禁止 */
  summary: string;
  /** 個別要素の描写 */
  elements: SceneElement[];
};

/** このターン取りうる行動（限定列挙）。action は GameMeta.actionVocabulary の部分集合 */
export type Affordance = {
  /** action id。apply() が今の state で実際に受理する語のみ */
  action: string;
  /** AIちゃんに見せる描写的ラベル */
  label: string;
  /** 補足の匂わせ（任意） */
  hint?: string;
};

/** 直前ターンの行動の結果として起きたことの描写 */
export type FeedbackSignal = {
  description: string;
  valence: Valence;
};

/**
 * AIちゃん（LLM）に毎ターン渡る唯一の入力。
 * 生状態 RawState は perceive() を通ってこの形に落ちる。これ以外は LLM に見えない。
 */
export type AIChanPerception = {
  /** 離散ターン番号。タイマーではない。プロンプトに数値露出しない（局面表現に使う） */
  turn: number;
  scene: Scene;
  /** 空配列なら手詰まり＝夢の終わり方の一型 */
  affordances: Affordance[];
  /** 初手ターンは空配列 */
  feedback: FeedbackSignal[];
  closure: ClosureHint;
};
