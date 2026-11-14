/**
 * emaStabilityAnalysis.ts
 * -----------------------------------------------------------------------
 * Comprehensive stability and parameter analysis for monocular webcam
 * distance estimation, comparing raw IPD distance jitter against EMA-smoothed
 * distance estimates.
 *
 * STANDARD DEVIATION CONVENTION:
 * By default, all stability metrics in this module use Sample Standard Deviation
 * (s with Bessel's correction, division by N - 1). This is the standard
 * statistical convention for finite discrete time-series sampled from a continuous
 * tracking process.
 * Population Standard Deviation (division by N) is also supported as an option.
 */

import {
  mean,
  sampleStdDev,
  populationStdDev,
  absoluteError,
  percentageError,
  median,
  calculateNoiseReduction,
} from "../utils/math";
import type { TemporalDistanceSample } from "./distanceSmoothing";

export type StabilityCategory = "Stable" | "Moderate" | "Elevated Noise";

export interface StabilityThresholds {
  /** Upper bound for 'Stable' category in centimetres. Default: 0.5 cm */
  stableMaxCm: number;
  /** Upper bound for 'Moderate' category in centimetres. Default: 1.0 cm. Above this is 'Elevated Noise' */
  moderateMaxCm: number;
}

export const DEFAULT_STABILITY_THRESHOLDS: StabilityThresholds = {
  stableMaxCm: 0.5,
  moderateMaxCm: 1.0,
};

export interface EmaStabilityMetrics {
  participantId: string;
  dataSource: "REAL" | "SIMULATED";
  referenceDistanceM: number;
  sampleCount: number;
  durationSec: number;
  effectiveFps: number;
  /** Raw distance standard deviation in centimetres */
  rawSdCm: number;
  /** EMA-smoothed distance standard deviation in centimetres */
  smoothedSdCm: number;
  /** Noise reduction percentage = ((raw SD - smoothed SD) / raw SD) * 100 */
  noiseReductionPct: number | null;
  /** Mean raw distance in meters */
  meanRawM: number;
  /** Mean EMA-smoothed distance in meters */
  meanSmoothedM: number;
  /** Absolute error between mean estimated distance and reference distance in centimetres */
  absoluteErrorCm: number;
  /** Percentage error between mean estimated distance and reference distance */
  percentageError: number;
  /** Count of transient outlier frames detected / filtered */
  outliersDetected: number;
  /** Assigned stability category based on current threshold explorer */
  stabilityCategory: StabilityCategory;
  /** Explicit standard deviation convention used */
  sdConvention: "Sample SD (N-1)" | "Population SD (N)";
  timestamp?: string;
  trackingQuality?: {
    confidenceAvg?: number;
    meanYawDeg?: number;
    meanPitchDeg?: number;
  };
}

export interface CohortSummary {
  totalCount: number;
  medianEmaSdCm: number;
  minEmaSdCm: number;
  maxEmaSdCm: number;
  meanNoiseReductionPct: number | null;
  medianNoiseReductionPct: number | null;
  stableCount: number;
  moderateCount: number;
  elevatedNoiseCount: number;
  stablePct: number;
  moderatePct: number;
  elevatedNoisePct: number;
}

/**
 * Assigns stability category based on current thresholds.
 */
export function categorizeStability(
  smoothedSdCm: number,
  thresholds: StabilityThresholds = DEFAULT_STABILITY_THRESHOLDS
): StabilityCategory {
  if (!Number.isFinite(smoothedSdCm) || smoothedSdCm < 0) {
    return "Elevated Noise";
  }
  if (smoothedSdCm <= thresholds.stableMaxCm) {
    return "Stable";
  }
  if (smoothedSdCm <= thresholds.moderateMaxCm) {
    return "Moderate";
  }
  return "Elevated Noise";
}

export interface ComputeEmaOptions {
  participantId: string;
  dataSource: "REAL" | "SIMULATED";
  referenceDistanceM?: number;
  thresholds?: StabilityThresholds;
  useSampleSd?: boolean; // defaults to true (Bessel's correction N-1)
  timestamp?: string;
  trackingQuality?: {
    confidenceAvg?: number;
    meanYawDeg?: number;
    meanPitchDeg?: number;
  };
}

/**
 * Computes complete EMA stability and error metrics from a temporal distance series.
 * Safely handles empty series, single samples, and zero raw standard deviation.
 */
export function computeEmaStabilityMetrics(
  samples: TemporalDistanceSample[],
  options: ComputeEmaOptions
): EmaStabilityMetrics {
  const {
    participantId,
    dataSource,
    thresholds = DEFAULT_STABILITY_THRESHOLDS,
    useSampleSd = true,
    timestamp = new Date().toISOString(),
    trackingQuality,
  } = options;

  const sdConvention = useSampleSd ? "Sample SD (N-1)" : "Population SD (N)";
  const sdFn = useSampleSd ? sampleStdDev : populationStdDev;

  // Handle empty or missing samples safely without substituting study values.
  if (!samples || samples.length === 0) {
    const refM = options.referenceDistanceM ?? Number.NaN;
    return {
      participantId,
      dataSource,
      referenceDistanceM: refM,
      sampleCount: 0,
      durationSec: 0,
      effectiveFps: 0,
      rawSdCm: 0,
      smoothedSdCm: 0,
      noiseReductionPct: null,
      meanRawM: Number.NaN,
      meanSmoothedM: Number.NaN,
      absoluteErrorCm: Number.NaN,
      percentageError: Number.NaN,
      outliersDetected: 0,
      stabilityCategory: "Elevated Noise",
      sdConvention,
      timestamp,
      trackingQuality,
    };
  }

  const validSamples = samples.filter(
    (sample) =>
      Number.isFinite(sample.timeSec) &&
      Number.isFinite(sample.rawDistanceM) &&
      Number.isFinite(sample.smoothedDistanceM)
  );
  const rawValuesM = validSamples.map((sample) => sample.rawDistanceM);
  const smoothedValuesM = validSamples.map((sample) => sample.smoothedDistanceM);

  // Derive reference distance
  const sampleReference = validSamples.find((sample) => Number.isFinite(sample.referenceDistanceM))?.referenceDistanceM;
  const refM = options.referenceDistanceM ?? sampleReference ?? Number.NaN;

  // Duration and effective FPS
  const firstTime = validSamples[0]?.timeSec ?? 0;
  const lastTime = validSamples[validSamples.length - 1]?.timeSec ?? 0;
  const rawDuration = lastTime - firstTime;
  const durationSec = rawDuration > 0 ? Number(rawDuration.toFixed(3)) : 0;
  const effectiveFps = durationSec > 0 ? Number((validSamples.length / durationSec).toFixed(1)) : 0;

  // Standard deviations converted to centimetres
  const rawSdM = rawValuesM.length > 0 ? sdFn(rawValuesM) : 0;
  const smoothedSdM = smoothedValuesM.length > 0 ? sdFn(smoothedValuesM) : 0;

  const rawSdCm = Number.isFinite(rawSdM) ? Number((rawSdM * 100).toFixed(3)) : 0;
  const smoothedSdCm = Number.isFinite(smoothedSdM) ? Number((smoothedSdM * 100).toFixed(3)) : 0;

  // Noise reduction percentage: safely handles zero raw SD
  const noiseReduction = calculateNoiseReduction(rawSdCm, smoothedSdCm);
  const noiseReductionPct = noiseReduction === null ? null : Number(noiseReduction.toFixed(2));

  // Means
  const meanRawM = rawValuesM.length > 0 ? Number(mean(rawValuesM).toFixed(4)) : 0;
  const meanSmoothedM = smoothedValuesM.length > 0 ? Number(mean(smoothedValuesM).toFixed(4)) : 0;

  // Errors against reference distance
  const absErrM = Number.isFinite(refM) ? absoluteError(meanSmoothedM, refM) : Number.NaN;
  const absoluteErrorCm = Number((absErrM * 100).toFixed(2));
  const pctErr = Number.isFinite(refM) ? percentageError(meanSmoothedM, refM) : Number.NaN;
  const percentageErrorVal = Number.isFinite(pctErr) ? Number(pctErr.toFixed(2)) : Number.NaN;

  // Outlier detection: count frames where raw distance deviates significantly from local window
  // Evaluated against the prior 15-frame rolling window baseline
  let outliersDetected = 0;
  const windowSize = 15;
  const rollingWindow: number[] = [];
  for (let i = 0; i < rawValuesM.length; i++) {
    const rawVal = rawValuesM[i];
    if (rollingWindow.length >= 5) {
      const winMed = median(rollingWindow);
      const winSd = sdFn(rollingWindow);
      if (winSd > 0 && Math.abs(rawVal - winMed) / winSd > 3.5) {
        outliersDetected++;
      }
    }
    rollingWindow.push(rawVal);
    if (rollingWindow.length > windowSize) rollingWindow.shift();
  }

  const stabilityCategory = categorizeStability(smoothedSdCm, thresholds);

  return {
    participantId,
    dataSource,
    referenceDistanceM: refM,
    sampleCount: validSamples.length,
    durationSec,
    effectiveFps,
    rawSdCm,
    smoothedSdCm,
    noiseReductionPct,
    meanRawM,
    meanSmoothedM,
    absoluteErrorCm,
    percentageError: percentageErrorVal,
    outliersDetected,
    stabilityCategory,
    sdConvention,
    timestamp,
    trackingQuality,
  };
}

/**
 * Calculates summary statistics for a cohort of stability metric records.
 */
export function calculateCohortSummary(records: EmaStabilityMetrics[]): CohortSummary {
  if (records.length === 0) {
    return {
      totalCount: 0,
      medianEmaSdCm: 0,
      minEmaSdCm: 0,
      maxEmaSdCm: 0,
      meanNoiseReductionPct: null,
      medianNoiseReductionPct: null,
      stableCount: 0,
      moderateCount: 0,
      elevatedNoiseCount: 0,
      stablePct: 0,
      moderatePct: 0,
      elevatedNoisePct: 0,
    };
  }

  const emaSds = records.map((r) => r.smoothedSdCm).filter(Number.isFinite);
  const noiseReductions = records
    .map((record) => record.noiseReductionPct)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const totalCount = records.length;
  const medianEmaSdCm = emaSds.length > 0 ? Number(median(emaSds).toFixed(3)) : 0;
  const minEmaSdCm = emaSds.length > 0 ? Number(Math.min(...emaSds).toFixed(3)) : 0;
  const maxEmaSdCm = emaSds.length > 0 ? Number(Math.max(...emaSds).toFixed(3)) : 0;

  const meanNoiseReductionPct =
    noiseReductions.length > 0 ? Number(mean(noiseReductions).toFixed(2)) : null;
  const medianNoiseReductionPct =
    noiseReductions.length > 0 ? Number(median(noiseReductions).toFixed(2)) : null;

  const stableCount = records.filter((r) => r.stabilityCategory === "Stable").length;
  const moderateCount = records.filter((r) => r.stabilityCategory === "Moderate").length;
  const elevatedNoiseCount = records.filter((r) => r.stabilityCategory === "Elevated Noise").length;

  return {
    totalCount,
    medianEmaSdCm,
    minEmaSdCm,
    maxEmaSdCm,
    meanNoiseReductionPct,
    medianNoiseReductionPct,
    stableCount,
    moderateCount,
    elevatedNoiseCount,
    stablePct: Number(((stableCount / totalCount) * 100).toFixed(1)),
    moderatePct: Number(((moderateCount / totalCount) * 100).toFixed(1)),
    elevatedNoisePct: Number(((elevatedNoiseCount / totalCount) * 100).toFixed(1)),
  };
}
