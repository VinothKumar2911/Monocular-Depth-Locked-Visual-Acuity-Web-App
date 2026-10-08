/**
 * distanceEstimator.ts
 * -----------------------------------------------------------------------
 * Converts a measured pixel IPD into an estimated camera-to-eye distance
 * using the pinhole camera model:
 *
 *     D = f * W / w
 *
 * where D = distance, f = effective focal length (px), W = real-world
 * IPD (mm), w = measured pixel IPD.
 *
 * Two IPD sources are supported (see MASTER PROMPT section 8):
 *   MODE A — Personal calibration: the user sits at a known distance and
 *            we solve for the camera's effective focal length, holding a
 *            configured/measured real IPD fixed.
 *   MODE B — Statistical: an assumed average adult IPD (default 63mm,
 *            configurable) is used directly with a focal length derived
 *            from calibration. Always explicitly labeled as an assumption.
 *
 * In both modes the *camera calibration* step (see calibration/) is what
 * ultimately produces the focal length parameter used here — this module
 * only implements the geometry, it does not manage calibration storage.
 */
import { pinholeDistance, solveFocalLength } from "../utils/math";

export type IPDMode = "personal" | "statistical";

export interface DistanceEstimateInput {
  /** Measured pixel IPD from the current frame. */
  ipdPixels: number;
  /** Effective focal length in pixels, from camera calibration. */
  focalLengthPx: number;
  /** Real-world IPD to assume, in millimeters (personal or statistical). */
  assumedIPDmm: number;
}

export interface DistanceEstimate {
  distanceMM: number;
  distanceM: number;
}

/** Core geometry: distance = f * W / w, expressed in millimeters. */
export function estimateDistance(input: DistanceEstimateInput): DistanceEstimate {
  const distanceMM = pinholeDistance(input.focalLengthPx, input.assumedIPDmm, input.ipdPixels);
  return { distanceMM, distanceM: distanceMM / 1000 };
}

/**
 * Personal calibration solve: given a known distance the user sat at, and
 * the pixel IPD measured there, back out the camera's effective focal
 * length (in pixels) for a given assumed real-world IPD.
 *    f = D * w / W
 */
export function calibrateFocalLength(knownDistanceM: number, measuredIPDpx: number, assumedIPDmm: number): number {
  const knownDistanceMM = knownDistanceM * 1000;
  return solveFocalLength(knownDistanceMM, measuredIPDpx, assumedIPDmm);
}

/**
 * Multi-point calibration: given several (distance, pixel IPD) pairs,
 * return the average solved focal length. Simple and robust; a full
 * least-squares regression could be substituted here without changing
 * the calling contract.
 */
export function calibrateFocalLengthMultiPoint(
  points: { distanceM: number; ipdPixels: number }[],
  assumedIPDmm: number,
): number {
  if (points.length === 0) return NaN;
  const focalLengths = points.map((p) => calibrateFocalLength(p.distanceM, p.ipdPixels, assumedIPDmm));
  return focalLengths.reduce((a, b) => a + b, 0) / focalLengths.length;
}
