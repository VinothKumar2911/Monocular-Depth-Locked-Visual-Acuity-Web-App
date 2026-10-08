/**
 * visualAngle.ts
 * -----------------------------------------------------------------------
 * Converts between viewing distance + target visual angle (arcminutes,
 * typically 5' for a 20/20-equivalent optotype) and required physical
 * optotype height, using the exact symmetric formula (not small-angle
 * approximation):
 *
 *     H = 2 * D * tan(theta / 2)
 *
 * and its inverse:
 *
 *     theta = 2 * atan( (H/2) / D )
 *
 * All functions here work in millimeters for H and meters for D unless
 * otherwise noted; callers are responsible for unit consistency (see
 * inline JSDoc per function).
 */
import { arcMinToRad, radToArcMin, requiredOptotypeHeight, actualVisualAngle } from "../utils/math";
import { CONFIG } from "../config";
import { logMARToSnellenDenominator } from "../utils/math";

/**
 * Required physical optotype HEIGHT (mm) for a given viewing distance
 * (meters) and target visual angle (arcminutes). Defaults to the
 * standard 5 arcmin (20/20-equivalent) target from CONFIG.
 */
export function requiredOptotypeHeightMM(
  distanceM: number,
  targetArcMin: number = CONFIG.targetVisualAngleArcMin,
): number {
  const thetaRad = arcMinToRad(targetArcMin);
  const distanceMM = distanceM * 1000;
  return requiredOptotypeHeight(distanceMM, thetaRad);
}

/**
 * Required optotype height (mm) for a given logMAR level at a given
 * viewing distance. A logMAR of 0.0 corresponds to the standard 5
 * arcmin (20/20) target; each +0.1 logMAR scales the optotype 10^0.1
 * larger (i.e. the classic logarithmic acuity progression).
 */
export function requiredOptotypeHeightMMForLogMAR(distanceM: number, logMAR: number): number {
  const snellenDenominator = logMARToSnellenDenominator(logMAR);
  const targetArcMin = CONFIG.targetVisualAngleArcMin * (snellenDenominator / 20);
  return requiredOptotypeHeightMM(distanceM, targetArcMin);
}

/**
 * The ACTUAL visual angle (arcminutes) subtended by a rendered optotype
 * of a given physical height (mm) at a given distance (meters). Used by
 * the research/debug panel to verify the target is actually being hit.
 */
export function actualVisualAngleArcMin(heightMM: number, distanceM: number): number {
  const distanceMM = distanceM * 1000;
  const thetaRad = actualVisualAngle(heightMM, distanceMM);
  return radToArcMin(thetaRad);
}
