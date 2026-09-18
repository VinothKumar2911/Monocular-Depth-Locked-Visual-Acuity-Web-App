/**
 * optotypeSizing.ts
 * -----------------------------------------------------------------------
 * Bridges visualAngle.ts (physical mm) and screenCalibration.ts
 * (px-per-mm) to produce the final on-screen pixel size for the
 * Tumbling E, plus the distance-change-threshold gating described in
 * MASTER PROMPT section 35 (don't resize for sub-millimeter jitter).
 */
import { mmToPixels, type ScreenCalibration } from "../calibration/screenCalibration";
import { requiredOptotypeHeightMM, requiredOptotypeHeightMMForLogMAR } from "./visualAngle";
import { CONFIG } from "../config";

export interface OptotypeSizeResult {
  heightMM: number;
  heightPX: number;
}

export function computeOptotypeSize(distanceM: number, screenCal: ScreenCalibration, logMAR = 0): OptotypeSizeResult {
  const heightMM = requiredOptotypeHeightMMForLogMAR(distanceM, logMAR);
  const heightPX = mmToPixels(heightMM, screenCal);
  return { heightMM, heightPX };
}

/** Standard 20/20-equivalent (5 arcmin, logMAR 0) size at a distance, ignoring logMAR staircase. */
export function computeStandardOptotypeSize(distanceM: number, screenCal: ScreenCalibration): OptotypeSizeResult {
  const heightMM = requiredOptotypeHeightMM(distanceM);
  const heightPX = mmToPixels(heightMM, screenCal);
  return { heightMM, heightPX };
}

/**
 * Distance-change gating: only report a "should resize" signal if the
 * new distance differs from the last-rendered distance by more than the
 * configured threshold. Prevents visible jitter from sub-millimeter
 * sensor noise (MASTER PROMPT section 35).
 */
export function shouldResize(
  newDistanceM: number,
  lastRenderedDistanceM: number | null,
  thresholdM: number = CONFIG.distanceChangeThresholdM,
): boolean {
  if (lastRenderedDistanceM === null) return true;
  return Math.abs(newDistanceM - lastRenderedDistanceM) > thresholdM;
}
