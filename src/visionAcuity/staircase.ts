/**
 * staircase.ts
 * -----------------------------------------------------------------------
 * Simple 1-up / 1-down adaptive logMAR staircase:
 *   - Correct response  -> decrease logMAR (smaller/harder optotype)
 *   - Incorrect response -> increase logMAR (larger/easier optotype)
 * Terminates after a configured number of direction reversals, or a
 * hard cap on trial count (whichever comes first).
 *
 * This is intentionally simple (a single-step-size 1-up/1-down rule)
 * rather than a full PEST/QUEST procedure — appropriate for a research
 * prototype, and clearly labeled as "Experimental" in the UI per
 * MASTER PROMPT section 21.
 */
import { CONFIG } from "../config";
import { clamp } from "../utils/math";

export type Orientation = 0 | 90 | 180 | 270;

export interface StaircaseState {
  currentLogMAR: number;
  trial: number;
  reversals: number;
  lastDirection: "up" | "down" | null;
  history: { logMAR: number; correct: boolean }[];
  finished: boolean;
}

export function createStaircase(): StaircaseState {
  return {
    currentLogMAR: CONFIG.startingLogMAR,
    trial: 0,
    reversals: 0,
    lastDirection: null,
    history: [],
    finished: false,
  };
}

export function stepStaircase(state: StaircaseState, correct: boolean): StaircaseState {
  const history = [...state.history, { logMAR: state.currentLogMAR, correct }];
  const trial = state.trial + 1;

  const direction: "up" | "down" = correct ? "down" : "up";
  let reversals = state.reversals;
  if (state.lastDirection !== null && state.lastDirection !== direction) {
    reversals += 1;
  }

  const delta = direction === "down" ? -CONFIG.logMARStep : CONFIG.logMARStep;
  const currentLogMAR = clamp(state.currentLogMAR + delta, CONFIG.minLogMAR, CONFIG.maxLogMAR);

  const finished = reversals >= CONFIG.requiredReversals || trial >= CONFIG.maxTrials;

  return {
    currentLogMAR,
    trial,
    reversals,
    lastDirection: direction,
    history,
    finished,
  };
}

/** Pick a random orientation, avoiding immediate repetition of the previous one. */
export function pickRandomOrientation(previous: Orientation | null): Orientation {
  const options: Orientation[] = [0, 90, 180, 270];
  const pool = previous === null ? options : options.filter((o) => o !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}
