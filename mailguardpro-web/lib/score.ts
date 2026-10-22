export interface ScoreBand {
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound, except for the last band. */
  max: number;
  /** Short label used in tables and stamps. */
  short: string;
  /** Full verdict used next to the gauge. */
  label: string;
  /** Share of the 0-100 scale, used for gauge segment widths. */
  span: number;
  /** CSS custom property for the band colour. */
  color: string;
  /** CSS custom property for legible text in the same hue. */
  textColor: string;
}

export const SCORE_BANDS: ScoreBand[] = [
  {
    min: 0,
    max: 25,
    short: "Critical",
    label: "Return to sender",
    span: 25,
    color: "var(--score-critical)",
    textColor: "var(--score-critical-text)",
  },
  {
    min: 26,
    max: 40,
    short: "Poor",
    label: "High risk",
    span: 15,
    color: "var(--score-poor)",
    textColor: "var(--score-poor-text)",
  },
  {
    min: 41,
    max: 60,
    short: "Caution",
    label: "Proceed with caution",
    span: 20,
    color: "var(--score-medium)",
    textColor: "var(--score-medium-text)",
  },
  {
    min: 61,
    max: 75,
    short: "Good",
    label: "Deliverable",
    span: 15,
    color: "var(--score-good)",
    textColor: "var(--score-good-text)",
  },
  {
    min: 76,
    max: 100,
    short: "Clear",
    label: "Clear to send",
    span: 25,
    color: "var(--score-excellent)",
    textColor: "var(--score-excellent-text)",
  },
];

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getScoreBand(score: number): ScoreBand {
  const value = clampScore(score);
  return SCORE_BANDS.find((band) => value >= band.min && value <= band.max) ?? SCORE_BANDS[0];
}
