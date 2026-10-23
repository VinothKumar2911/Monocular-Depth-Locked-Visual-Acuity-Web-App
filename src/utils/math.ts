/**
 * math.ts
 * -----------------------------------------------------------------------
 * Pure, unit-tested math helpers. No DOM/React/MediaPipe imports allowed
 * here — this file should be trivially testable in isolation.
 */

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const arcMinToRad = (arcMin: number): number => degToRad(arcMin / 60);
export const radToArcMin = (rad: number): number => radToDeg(rad) * 60;

/** Euclidean distance between two 2D points. */
export function euclideanDistance2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Pinhole camera model: D = f * W / w
 *  D = estimated distance from camera to subject
 *  f = effective focal length, expressed in the SAME pixel units as w
 *  W = known real-world size of the reference feature (e.g. IPD in mm)
 *  w = measured size of that feature in the image, in pixels
 */
export function pinholeDistance(focalLengthPx: number, realWorldSizeMM: number, measuredPx: number): number {
  if (measuredPx <= 0) return NaN;
  // Result is in the same units as realWorldSizeMM (mm); caller converts.
  return (focalLengthPx * realWorldSizeMM) / measuredPx;
}

/**
 * Inverse of pinholeDistance — solve for the effective focal length given
 * a known distance, a known real-world size, and a measured pixel size.
 * Used during personal camera calibration:  f = D * w / W
 */
export function solveFocalLength(distanceMM: number, measuredPx: number, realWorldSizeMM: number): number {
  if (realWorldSizeMM <= 0) return NaN;
  return (distanceMM * measuredPx) / realWorldSizeMM;
}

/**
 * Required physical optotype height for a target visual angle at a given
 * viewing distance, using the exact (non-small-angle) symmetric formula:
 *   H = 2 * D * tan(theta / 2)
 * D and H are returned in the same linear unit (e.g. both mm, or both m).
 */
export function requiredOptotypeHeight(distance: number, thetaRad: number): number {
  return 2 * distance * Math.tan(thetaRad / 2);
}

/**
 * Actual visual angle (radians) subtended by a physical optotype of
 * height H at distance D. Inverse of requiredOptotypeHeight.
 *   theta = 2 * atan( (H/2) / D )
 */
export function actualVisualAngle(height: number, distance: number): number {
  return 2 * Math.atan(height / 2 / distance);
}

/** Exponential moving average step: alpha * current + (1-alpha) * previous. */
export function emaStep(current: number, previous: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Population variance: (1 / N) * sum((x_i - mean)^2)
 * Division by N. Returns NaN for empty arrays.
 */
export function populationVariance(values: number[]): number {
  if (values.length === 0) return NaN;
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

/**
 * Sample variance with Bessel's correction: (1 / (N - 1)) * sum((x_i - mean)^2)
 * Unbiased estimator for sample variance.
 * Returns NaN for empty array, 0 for single-element array (no variation).
 */
export function sampleVariance(values: number[]): number {
  if (values.length === 0) return NaN;
  if (values.length === 1) return 0;
  const m = mean(values);
  const sumSq = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return sumSq / (values.length - 1);
}

/** Backwards-compatible alias for populationVariance */
export function variance(values: number[]): number {
  return populationVariance(values);
}

/**
 * Population standard deviation: sqrt(populationVariance)
 * Formula: sigma = sqrt((1 / N) * sum((x_i - mu)^2))
 */
export function populationStdDev(values: number[]): number {
  return Math.sqrt(populationVariance(values));
}

/**
 * Sample standard deviation with Bessel's correction: sqrt(sampleVariance)
 * Formula: s = sqrt((1 / (N - 1)) * sum((x_i - x_bar)^2))
 * Standard convention for finite continuous time-series samples.
 */
export function sampleStdDev(values: number[]): number {
  return Math.sqrt(sampleVariance(values));
}

/**
 * Calculate standard deviation with configurable convention.
 * @param values Array of numbers
 * @param isSample If true, uses sample SD (s, N-1); if false, uses population SD (sigma, N). Default is false for backwards compatibility.
 */
export function stdDev(values: number[], isSample = false): number {
  return isSample ? sampleStdDev(values) : populationStdDev(values);
}

/**
 * Noise reduction percentage: ((raw SD - smoothed SD) / raw SD) * 100
 * Safely handles zero raw SD, non-finite values, and negative cases (noise inflation).
 * Returns null if raw SD <= 0 or if values are invalid (undefined / not applicable).
 * If clampNegative is false (default), preserves negative percentages indicating noise inflation.
 */
export function calculateNoiseReduction(
  rawSd: number,
  smoothedSd: number,
  clampNegative = false
): number | null {
  if (!Number.isFinite(rawSd) || !Number.isFinite(smoothedSd) || rawSd <= 0) {
    return null;
  }
  const reduction = ((rawSd - smoothedSd) / rawSd) * 100;
  return clampNegative ? Math.max(0, reduction) : reduction;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---- Error metrics (used by validation mode) ------------------------------

export function absoluteError(estimated: number, actual: number): number {
  return Math.abs(estimated - actual);
}

export function percentageError(estimated: number, actual: number): number {
  if (actual === 0) return NaN;
  return (Math.abs(estimated - actual) / actual) * 100;
}

export function meanAbsoluteError(estimated: number[], actual: number[]): number {
  if (estimated.length !== actual.length || estimated.length === 0) return NaN;
  const errors = estimated.map((e, i) => absoluteError(e, actual[i]));
  return mean(errors);
}

export function rootMeanSquareError(estimated: number[], actual: number[]): number {
  if (estimated.length !== actual.length || estimated.length === 0) return NaN;
  const squaredErrors = estimated.map((e, i) => (e - actual[i]) ** 2);
  return Math.sqrt(mean(squaredErrors));
}

export function maxAbsoluteError(estimated: number[], actual: number[]): number {
  if (estimated.length !== actual.length || estimated.length === 0) return NaN;
  return Math.max(...estimated.map((e, i) => absoluteError(e, actual[i])));
}

// ---- logMAR / Snellen conversions ------------------------------------------

/** Convert a logMAR value to a Snellen-style "20/X" denominator. */
export function logMARToSnellenDenominator(logMAR: number): number {
  return 20 * 10 ** logMAR;
}

export function logMARToSnellenString(logMAR: number): string {
  const denom = logMARToSnellenDenominator(logMAR);
  return `20/${Math.round(denom)}`;
}

export function snellenDenominatorToLogMAR(denominator: number): number {
  return Math.log10(denominator / 20);
}
