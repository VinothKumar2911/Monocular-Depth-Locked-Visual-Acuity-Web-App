import { describe, it, expect } from "vitest";
import {
  sampleStdDev,
  populationStdDev,
  sampleVariance,
  populationVariance,
  stdDev,
  calculateNoiseReduction,
} from "../utils/math";
import {
  computeEmaStabilityMetrics,
  categorizeStability,
  calculateCohortSummary,
  DEFAULT_STABILITY_THRESHOLDS,
  type EmaStabilityMetrics,
} from "../vision/emaStabilityAnalysis";
import type { TemporalDistanceSample } from "../vision/distanceSmoothing";

describe("Standard deviation and variance conventions", () => {
  const data = [1.0, 2.0, 3.0, 4.0, 5.0]; // mean = 3.0
  // sum sq = (1-3)^2 + (2-3)^2 + (3-3)^2 + (4-3)^2 + (5-3)^2 = 4 + 1 + 0 + 1 + 4 = 10
  // population variance = 10 / 5 = 2.0 -> pop SD = sqrt(2) ≈ 1.41421356
  // sample variance = 10 / (5 - 1) = 2.5 -> sample SD = sqrt(2.5) ≈ 1.58113883

  it("calculates exact population variance and SD (division by N)", () => {
    expect(populationVariance(data)).toBeCloseTo(2.0, 6);
    expect(populationStdDev(data)).toBeCloseTo(Math.sqrt(2.0), 6);
    expect(stdDev(data, false)).toBeCloseTo(Math.sqrt(2.0), 6);
  });

  it("calculates exact sample variance and SD with Bessel's correction (N - 1)", () => {
    expect(sampleVariance(data)).toBeCloseTo(2.5, 6);
    expect(sampleStdDev(data)).toBeCloseTo(Math.sqrt(2.5), 6);
    expect(stdDev(data, true)).toBeCloseTo(Math.sqrt(2.5), 6);
  });

  it("handles edge cases safely (empty, single sample, zero SD)", () => {
    expect(populationStdDev([])).toBeNaN();
    expect(sampleStdDev([])).toBeNaN();
    expect(sampleStdDev([42])).toBe(0);
    expect(populationStdDev([42])).toBe(0);

    const identical = [1.5, 1.5, 1.5, 1.5];
    expect(sampleStdDev(identical)).toBe(0);
    expect(populationStdDev(identical)).toBe(0);
  });
});

describe("Noise reduction percentage calculation", () => {
  it("computes exact noise reduction percentage: ((raw - smoothed) / raw) * 100", () => {
    const raw = 2.0;
    const smoothed = 0.5;
    expect(calculateNoiseReduction(raw, smoothed)).toBeCloseTo(75.0, 5);
  });

  it("reports zero raw SD as not applicable", () => {
    expect(calculateNoiseReduction(0, 0)).toBeNull();
    expect(calculateNoiseReduction(0, 0.5)).toBeNull();
    expect(calculateNoiseReduction(-1, 0.5)).toBeNull();
  });

  it("safely handles non-finite values and noise inflation", () => {
    expect(calculateNoiseReduction(NaN, 1.0)).toBeNull();
    expect(calculateNoiseReduction(1.0, NaN)).toBeNull();
    expect(calculateNoiseReduction(1.0, 1.5)).toBe(-50);
  });
});

describe("EMA Stability Metrics computation", () => {
  const mockSamples: TemporalDistanceSample[] = [
    { timeSec: 0.0, rawDistanceM: 1.52, smoothedDistanceM: 1.51, referenceDistanceM: 1.5 },
    { timeSec: 0.033, rawDistanceM: 1.48, smoothedDistanceM: 1.5, referenceDistanceM: 1.5 },
    { timeSec: 0.067, rawDistanceM: 1.54, smoothedDistanceM: 1.51, referenceDistanceM: 1.5 },
    { timeSec: 0.1, rawDistanceM: 1.47, smoothedDistanceM: 1.5, referenceDistanceM: 1.5 },
    { timeSec: 0.133, rawDistanceM: 1.51, smoothedDistanceM: 1.505, referenceDistanceM: 1.5 },
  ];

  it("computes SD in centimetres and noise reduction", () => {
    const metrics = computeEmaStabilityMetrics(mockSamples, {
      participantId: "V01",
      dataSource: "SIMULATED",
      referenceDistanceM: 1.5,
      thresholds: DEFAULT_STABILITY_THRESHOLDS,
      useSampleSd: true,
    });

    expect(metrics.participantId).toBe("V01");
    expect(metrics.dataSource).toBe("SIMULATED");
    expect(metrics.referenceDistanceM).toBe(1.5);
    expect(metrics.sampleCount).toBe(5);
    expect(metrics.rawSdCm).toBeGreaterThan(0);
    expect(metrics.smoothedSdCm).toBeGreaterThan(0);
    expect(metrics.rawSdCm).toBeGreaterThan(metrics.smoothedSdCm);
    expect(metrics.noiseReductionPct).toBeGreaterThan(0);
    expect(metrics.meanSmoothedM).toBeCloseTo(1.505, 2);
    expect(metrics.absoluteErrorCm).toBeGreaterThanOrEqual(0);
    expect(metrics.sdConvention).toBe("Sample SD (N-1)");
  });

  it("safely handles empty sample arrays without throwing", () => {
    const metrics = computeEmaStabilityMetrics([], {
      participantId: "EMPTY",
      dataSource: "REAL",
      referenceDistanceM: 1.5,
    });

    expect(metrics.sampleCount).toBe(0);
    expect(metrics.rawSdCm).toBe(0);
    expect(metrics.smoothedSdCm).toBe(0);
    expect(metrics.noiseReductionPct).toBeNull();
    expect(metrics.stabilityCategory).toBe("Elevated Noise");
  });

  it("reports zero raw variability as not applicable and preserves noise inflation", () => {
    const zeroRaw = [
      { timeSec: 0, rawDistanceM: 1, smoothedDistanceM: 1, referenceDistanceM: 1 },
      { timeSec: 1, rawDistanceM: 1, smoothedDistanceM: 1.1, referenceDistanceM: 1 },
    ];
    expect(
      computeEmaStabilityMetrics(zeroRaw, {
        participantId: "P01-R1",
        dataSource: "REAL",
        referenceDistanceM: 1,
      }).noiseReductionPct
    ).toBeNull();

    const inflated = computeEmaStabilityMetrics(
      [
        { timeSec: 0, rawDistanceM: 1, smoothedDistanceM: 0.9, referenceDistanceM: 1 },
        { timeSec: 1, rawDistanceM: 1.01, smoothedDistanceM: 1.1, referenceDistanceM: 1 },
      ],
      { participantId: "P01-R2", dataSource: "REAL", referenceDistanceM: 1 }
    );
    expect(inflated.noiseReductionPct).toBeLessThan(0);
  });
});

describe("Stability Threshold Explorer categorization", () => {
  const customThresholds = { stableMaxCm: 0.4, moderateMaxCm: 0.8 };

  it("categorizes <= stableMaxCm as Stable", () => {
    expect(categorizeStability(0.3, customThresholds)).toBe("Stable");
    expect(categorizeStability(0.4, customThresholds)).toBe("Stable");
  });

  it("categorizes > stableMaxCm and <= moderateMaxCm as Moderate", () => {
    expect(categorizeStability(0.41, customThresholds)).toBe("Moderate");
    expect(categorizeStability(0.8, customThresholds)).toBe("Moderate");
  });

  it("categorizes > moderateMaxCm as Elevated Noise", () => {
    expect(categorizeStability(0.81, customThresholds)).toBe("Elevated Noise");
    expect(categorizeStability(2.5, customThresholds)).toBe("Elevated Noise");
  });

  it("summarizes a cohort distribution accurately", () => {
    const mockMetrics: EmaStabilityMetrics[] = [
      {
        participantId: "V01",
        dataSource: "SIMULATED",
        referenceDistanceM: 1.0,
        sampleCount: 90,
        durationSec: 3.0,
        effectiveFps: 30,
        rawSdCm: 1.8,
        smoothedSdCm: 0.35, // Stable
        noiseReductionPct: 80.5,
        meanRawM: 1.0,
        meanSmoothedM: 1.0,
        absoluteErrorCm: 0.2,
        percentageError: 0.2,
        outliersDetected: 0,
        stabilityCategory: "Stable",
        sdConvention: "Sample SD (N-1)",
      },
      {
        participantId: "V02",
        dataSource: "SIMULATED",
        referenceDistanceM: 1.5,
        sampleCount: 90,
        durationSec: 3.0,
        effectiveFps: 30,
        rawSdCm: 2.2,
        smoothedSdCm: 0.65, // Moderate
        noiseReductionPct: 70.4,
        meanRawM: 1.5,
        meanSmoothedM: 1.5,
        absoluteErrorCm: 0.3,
        percentageError: 0.2,
        outliersDetected: 1,
        stabilityCategory: "Moderate",
        sdConvention: "Sample SD (N-1)",
      },
    ];

    const summary = calculateCohortSummary(mockMetrics);
    expect(summary.totalCount).toBe(2);
    expect(summary.stableCount).toBe(1);
    expect(summary.moderateCount).toBe(1);
    expect(summary.elevatedNoiseCount).toBe(0);
    expect(summary.stablePct).toBe(50.0);
    expect(summary.moderatePct).toBe(50.0);
    expect(summary.medianEmaSdCm).toBeCloseTo(0.5, 2);
  });
});
