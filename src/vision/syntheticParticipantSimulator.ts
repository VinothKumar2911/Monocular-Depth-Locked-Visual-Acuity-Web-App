/**
 * syntheticParticipantSimulator.ts
 * -----------------------------------------------------------------------
 * Reproducible synthetic participant simulator for monocular distance tracking.
 *
 * Simulates 10 virtual participants (V01-V10) with realistic physical head drift,
 * distance-dependent optical sensor noise, and occasional transient tracking outliers.
 *
 * CRITICAL RESEARCH SAFEGUARDS:
 * 1. SIMULATION REALISM: Every simulated raw distance sample is passed through the
 *    SAME production DistanceSmoother (15-frame rolling window outlier rejection + EMA)
 *    used during live webcam validation. Metrics are strictly computed from the resulting
 *    generated time-series — NEVER fabricated or invented independently.
 * 2. DETERMINISTIC REPRODUCIBILITY: Uses a fixed-seed Mulberry32 PRNG so that results
 *    are 100% reproducible across machines and browsers.
 * 3. STRICT SEPARATION: All records are stamped with dataSource: "SIMULATED" and
 *    isSimulated: true. Simulated data is NEVER saved to IndexedDB or merged with
 *    real human validation sessions.
 */

import { CONFIG } from "../config";
import { DistanceSmoother, type TemporalDistanceSample } from "./distanceSmoothing";
import {
  computeEmaStabilityMetrics,
  categorizeStability,
  type EmaStabilityMetrics,
  type StabilityThresholds,
  DEFAULT_STABILITY_THRESHOLDS,
} from "./emaStabilityAnalysis";

export const SIMULATION_LABEL = "SIMULATED DATA — NOT REAL HUMAN PARTICIPANTS";
export const DEFAULT_SIMULATOR_SEED = 0x5f3759df; // Deterministic fixed seed

export interface VirtualParticipantConfig {
  id: string; // "V01" to "V10"
  referenceDistanceM: number;
  /** High-frequency measurement noise stddev in meters (scales with distance in pinhole optics) */
  sensorNoiseSdM: number;
  /** Low-frequency postural sway/drift amplitude in meters */
  driftAmpM: number;
  /** Frequency of drift oscillation in Hz */
  driftFreqHz: number;
  /** Frame indices where transient landmark detection spikes (outliers) occur */
  outlierSpikes?: { frameIndex: number; magnitudeM: number }[];
}

/**
 * Standard cohort configuration for 10 virtual participants spanning typical
 * visual acuity testing distances (0.80 m to 2.50 m).
 */
export const DEFAULT_VIRTUAL_PARTICIPANTS: VirtualParticipantConfig[] = [
  {
    id: "V01",
    referenceDistanceM: 0.8,
    sensorNoiseSdM: 0.008, // Near range, high pixel resolution
    driftAmpM: 0.002,
    driftFreqHz: 0.3,
    outlierSpikes: [{ frameIndex: 42, magnitudeM: 0.08 }],
  },
  {
    id: "V02",
    referenceDistanceM: 1.0,
    sensorNoiseSdM: 0.009,
    driftAmpM: 0.0025,
    driftFreqHz: 0.25,
    outlierSpikes: [{ frameIndex: 70, magnitudeM: -0.075 }],
  },
  {
    id: "V03",
    referenceDistanceM: 1.2,
    sensorNoiseSdM: 0.011,
    driftAmpM: 0.003,
    driftFreqHz: 0.35,
    outlierSpikes: [{ frameIndex: 25, magnitudeM: 0.085 }],
  },
  {
    id: "V04",
    referenceDistanceM: 1.4,
    sensorNoiseSdM: 0.013,
    driftAmpM: 0.0035,
    driftFreqHz: 0.28,
  },
  {
    id: "V05",
    referenceDistanceM: 1.5, // Standard research benchmark
    sensorNoiseSdM: 0.017,
    driftAmpM: 0.006,
    driftFreqHz: 0.33,
    outlierSpikes: [
      { frameIndex: 20, magnitudeM: 0.09 },
      { frameIndex: 68, magnitudeM: -0.08 },
    ],
  },
  {
    id: "V06",
    referenceDistanceM: 1.6,
    sensorNoiseSdM: 0.019,
    driftAmpM: 0.0065,
    driftFreqHz: 0.22,
    outlierSpikes: [{ frameIndex: 55, magnitudeM: 0.095 }],
  },
  {
    id: "V07",
    referenceDistanceM: 1.8,
    sensorNoiseSdM: 0.022,
    driftAmpM: 0.0075,
    driftFreqHz: 0.3,
  },
  {
    id: "V08",
    referenceDistanceM: 2.0, // Standard 2.0m testing distance
    sensorNoiseSdM: 0.026,
    driftAmpM: 0.009,
    driftFreqHz: 0.27,
    outlierSpikes: [{ frameIndex: 35, magnitudeM: -0.1 }],
  },
  {
    id: "V09",
    referenceDistanceM: 2.2,
    sensorNoiseSdM: 0.031,
    driftAmpM: 0.011,
    driftFreqHz: 0.31,
    outlierSpikes: [{ frameIndex: 60, magnitudeM: 0.11 }],
  },
  {
    id: "V10",
    referenceDistanceM: 2.5, // Extended range boundary
    sensorNoiseSdM: 0.036,
    driftAmpM: 0.013,
    driftFreqHz: 0.29,
    outlierSpikes: [
      { frameIndex: 18, magnitudeM: 0.12 },
      { frameIndex: 75, magnitudeM: -0.1 },
    ],
  },
];

export interface SimulatedParticipantRecord {
  participantId: string;
  isSimulated: true;
  label: string; // "SIMULATED DATA — NOT REAL HUMAN PARTICIPANTS"
  referenceDistanceM: number;
  temporalSamples: TemporalDistanceSample[];
  metrics: EmaStabilityMetrics;
}

/**
 * Deterministic Mulberry32 32-bit pseudo-random number generator.
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal (Gaussian) sample using Box-Muller transform with seeded PRNG.
 */
export function sampleGaussian(rng: () => number, mean = 0, stdDev = 1): number {
  const u1 = Math.max(1e-15, rng());
  const u2 = rng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

export interface SimulatorOptions {
  seed?: number;
  alpha?: number;
  durationSec?: number;
  fps?: number;
  thresholds?: StabilityThresholds;
  participants?: VirtualParticipantConfig[];
}

/**
 * Simulates a single virtual participant's 3-second distance tracking time series
 * and processes it through the production DistanceSmoother pipeline.
 */
export function simulateVirtualParticipant(
  config: VirtualParticipantConfig,
  rng: () => number,
  options?: {
    alpha?: number;
    durationSec?: number;
    fps?: number;
    thresholds?: StabilityThresholds;
  }
): SimulatedParticipantRecord {
  const alpha = options?.alpha ?? CONFIG.defaultSmoothingAlpha;
  const durationSec = options?.durationSec ?? 3.0;
  const fps = options?.fps ?? 30;
  const thresholds = options?.thresholds ?? DEFAULT_STABILITY_THRESHOLDS;

  const totalFrames = Math.round(durationSec * fps);
  const dt = 1 / fps;

  // Exact production smoother with 15-frame rolling window and 4-sigma outlier rejection
  const smoother = new DistanceSmoother(alpha, 15);
  const temporalSamples: TemporalDistanceSample[] = [];

  // Random phase for head drift so each participant has unique natural movement
  const phase = rng() * Math.PI * 2;

  // Map of configured outlier spikes by frame
  const spikeMap = new Map<number, number>();
  if (config.outlierSpikes) {
    for (const spike of config.outlierSpikes) {
      spikeMap.set(spike.frameIndex, spike.magnitudeM);
    }
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const timeSec = Number((frame * dt).toFixed(3));

    // 1. Postural head drift: slow sinusoidal sway
    const drift = Math.sin(2 * Math.PI * config.driftFreqHz * timeSec + phase) * config.driftAmpM;

    // 2. High-frequency sensor measurement noise: Gaussian landmark jitter
    const noise = sampleGaussian(rng, 0, config.sensorNoiseSdM);

    // 3. Transient landmark tracking glitch / outlier spike
    const spike = spikeMap.get(frame) ?? 0;

    // 4. Raw webcam distance estimate in meters
    const rawDistanceM = Number((config.referenceDistanceM + drift + noise + spike).toFixed(4));

    // 5. Feed into production smoother: handles 4-sigma outlier rejection and EMA
    const smoothRes = smoother.push(rawDistanceM);

    temporalSamples.push({
      timeSec,
      rawDistanceM,
      smoothedDistanceM: Number(smoothRes.smoothed.toFixed(4)),
      referenceDistanceM: config.referenceDistanceM,
    });
  }

  // 6. Compute derived stability metrics strictly from the generated time-series
  const metrics = computeEmaStabilityMetrics(temporalSamples, {
    participantId: config.id,
    dataSource: "SIMULATED",
    referenceDistanceM: config.referenceDistanceM,
    thresholds,
    useSampleSd: true, // Sample SD (N-1) convention
    trackingQuality: {
      confidenceAvg: 0.94,
      meanYawDeg: 1.8,
      meanPitchDeg: 1.4,
    },
  });

  return {
    participantId: config.id,
    isSimulated: true,
    label: SIMULATION_LABEL,
    referenceDistanceM: config.referenceDistanceM,
    temporalSamples,
    metrics,
  };
}

/**
 * Runs the reproducible 10-participant virtual cohort simulation.
 */
export function runSyntheticParticipantCohort(
  options?: SimulatorOptions
): SimulatedParticipantRecord[] {
  const seed = options?.seed ?? DEFAULT_SIMULATOR_SEED;
  const rng = createMulberry32(seed);
  const configs = options?.participants ?? DEFAULT_VIRTUAL_PARTICIPANTS;

  return configs.map((config) =>
    simulateVirtualParticipant(config, rng, {
      alpha: options?.alpha,
      durationSec: options?.durationSec,
      fps: options?.fps,
      thresholds: options?.thresholds,
    })
  );
}

/**
 * Helper to update stability categories dynamically when user changes thresholds
 * without regenerating the underlying time series.
 */
export function reclassifySimulatedCohort(
  records: SimulatedParticipantRecord[],
  thresholds: StabilityThresholds
): SimulatedParticipantRecord[] {
  return records.map((record) => {
    const updatedCategory = categorizeStability(record.metrics.smoothedSdCm, thresholds);
    return {
      ...record,
      metrics: {
        ...record.metrics,
        stabilityCategory: updatedCategory,
      },
    };
  });
}
