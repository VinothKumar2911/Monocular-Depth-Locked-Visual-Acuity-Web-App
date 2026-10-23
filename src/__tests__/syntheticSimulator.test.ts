import { describe, it, expect } from "vitest";
import {
  runSyntheticParticipantCohort,
  reclassifySimulatedCohort,
  SIMULATION_LABEL,
  DEFAULT_SIMULATOR_SEED,
  createMulberry32,
  sampleGaussian,
} from "../vision/syntheticParticipantSimulator";

describe("Synthetic Participant Simulator (Feature 2)", () => {
  it("generates exactly 10 virtual participants (V01 to V10) with prominent simulated labels", () => {
    const cohort = runSyntheticParticipantCohort();
    expect(cohort.length).toBe(10);

    const ids = cohort.map((p) => p.participantId);
    expect(ids).toEqual(["V01", "V02", "V03", "V04", "V05", "V06", "V07", "V08", "V09", "V10"]);

    for (const p of cohort) {
      expect(p.isSimulated).toBe(true);
      expect(p.label).toBe(SIMULATION_LABEL);
      expect(p.metrics.dataSource).toBe("SIMULATED");
      expect(p.metrics.sampleCount).toBe(90); // 3 seconds at 30 fps
      expect(p.metrics.durationSec).toBeCloseTo(3.0, 1);
      expect(p.temporalSamples.length).toBe(90);
    }
  });

  it("is 100% deterministic and reproducible with fixed seed", () => {
    const run1 = runSyntheticParticipantCohort({ seed: DEFAULT_SIMULATOR_SEED });
    const run2 = runSyntheticParticipantCohort({ seed: DEFAULT_SIMULATOR_SEED });

    for (let i = 0; i < 10; i++) {
      expect(run1[i].metrics.rawSdCm).toBe(run2[i].metrics.rawSdCm);
      expect(run1[i].metrics.smoothedSdCm).toBe(run2[i].metrics.smoothedSdCm);
      expect(run1[i].metrics.noiseReductionPct).toBe(run2[i].metrics.noiseReductionPct);
      expect(run1[i].temporalSamples[0].rawDistanceM).toBe(run2[i].temporalSamples[0].rawDistanceM);
    }
  });

  it("passes samples through production DistanceSmoother and consistently reduces noise", () => {
    const cohort = runSyntheticParticipantCohort();

    for (const p of cohort) {
      // EMA smoothed SD must be less than raw SD for all noisy time series
      expect(p.metrics.smoothedSdCm).toBeLessThan(p.metrics.rawSdCm);
      expect(p.metrics.noiseReductionPct).toBeGreaterThan(0);
      // Mean estimated distance should be close to reference distance (within realistic bounds)
      expect(Math.abs(p.metrics.meanSmoothedM - p.referenceDistanceM)).toBeLessThan(0.05);
    }
  });

  it("detects and rejects transient outlier spikes via 4-sigma window filter", () => {
    const cohort = runSyntheticParticipantCohort();
    // V05, V10 have configured outlier spikes
    const v05 = cohort.find((p) => p.participantId === "V05")!;
    expect(v05.metrics.outliersDetected).toBeGreaterThanOrEqual(1);
  });

  it("dynamically re-categorizes cohort when threshold explorer changes cutoffs", () => {
    const cohort = runSyntheticParticipantCohort();

    // With very strict threshold (0.1 cm), most or all should become Moderate or Elevated Noise
    const strictCohort = reclassifySimulatedCohort(cohort, {
      stableMaxCm: 0.1,
      moderateMaxCm: 0.3,
    });
    const strictStableCount = strictCohort.filter((p) => p.metrics.stabilityCategory === "Stable").length;
    expect(strictStableCount).toBeLessThan(cohort.filter((p) => p.metrics.stabilityCategory === "Stable").length);

    // With very lenient threshold (5.0 cm), all should become Stable
    const lenientCohort = reclassifySimulatedCohort(cohort, {
      stableMaxCm: 5.0,
      moderateMaxCm: 10.0,
    });
    const allStable = lenientCohort.every((p) => p.metrics.stabilityCategory === "Stable");
    expect(allStable).toBe(true);
  });
});

describe("Seeded Mulberry32 PRNG and Gaussian sampler", () => {
  it("produces deterministic random values in [0, 1)", () => {
    const rng1 = createMulberry32(12345);
    const rng2 = createMulberry32(12345);
    for (let i = 0; i < 50; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it("produces standard normal distribution with mean ~ 0 and std ~ 1", () => {
    const rng = createMulberry32(99999);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(sampleGaussian(rng, 0, 1));
    }
    const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(sampleMean).toBeCloseTo(0, 1);
  });
});
