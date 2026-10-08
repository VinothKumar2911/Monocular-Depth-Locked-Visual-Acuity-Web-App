/**
 * scoring.ts
 * -----------------------------------------------------------------------
 * Reduces a completed staircase's trial history into a single reported
 * visual-acuity estimate. Uses the mean logMAR of the reversal trials
 * (a standard, simple way to summarize a staircase), converted to a
 * Snellen-style "20/X" string for readability. Always presented as an
 * "Experimental visual-acuity estimate" — never claimed as clinically
 * validated (MASTER PROMPT section 21).
 */
import { logMARToSnellenString, mean, stdDev } from "../utils/math";
import type { StaircaseState } from "./staircase";

export interface AcuityResult {
  logMAR: number;
  snellen: string;
  trialsCompleted: number;
  correctCount: number;
  reversals: number;
}

/**
 * Estimate final acuity as the mean logMAR of the last N trials (N =
 * min(reversals, 6) or all trials if fewer). This dampens the influence
 * of the early, easy trials before the staircase converges.
 */
export function scoreStaircase(state: StaircaseState): AcuityResult {
  const { history } = state;
  const tailCount = Math.min(6, history.length);
  const tail = history.slice(-tailCount);
  const logMAR = tail.length > 0 ? mean(tail.map((h) => h.logMAR)) : state.currentLogMAR;
  const correctCount = history.filter((h) => h.correct).length;

  return {
    logMAR,
    snellen: logMARToSnellenString(logMAR),
    trialsCompleted: history.length,
    correctCount,
    reversals: state.reversals,
  };
}

export function distanceStabilityStdDevM(distances: number[]): number {
  return stdDev(distances);
}
