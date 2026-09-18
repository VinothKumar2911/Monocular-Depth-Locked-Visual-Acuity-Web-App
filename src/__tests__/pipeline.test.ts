import { describe, it, expect } from "vitest";
import { computeScreenCalibration, mmToPixels, pixelsToMM } from "../calibration/screenCalibration";
import { createStaircase, stepStaircase, pickRandomOrientation } from "../visionAcuity/staircase";
import { DistanceSmoother } from "../vision/distanceSmoothing";
import { calibrateFocalLength, estimateDistance } from "../vision/distanceEstimator";

describe("screen calibration", () => {
  it("computes pixels-per-mm from a displayed reference size", () => {
    const cal = computeScreenCalibration(189, 50); // e.g. 3.78 px/mm
    expect(cal.pixelsPerMM).toBeCloseTo(3.78, 2);
  });

  it("round-trips mm -> px -> mm", () => {
    const cal = computeScreenCalibration(189, 50);
    const px = mmToPixels(10, cal);
    expect(pixelsToMM(px, cal)).toBeCloseTo(10, 6);
  });
});

describe("camera calibration + distance estimation round trip", () => {
  it("recovers ~1.50m after calibrating at 1.50m with the same IPD", () => {
    const measuredIPDpx = 140;
    const assumedIPDmm = 63;
    const f = calibrateFocalLength(1.5, measuredIPDpx, assumedIPDmm);
    const { distanceM } = estimateDistance({ ipdPixels: measuredIPDpx, focalLengthPx: f, assumedIPDmm });
    expect(distanceM).toBeCloseTo(1.5, 5);
  });

  it("estimates a larger distance for a smaller measured IPD (inverse relationship)", () => {
    const f = calibrateFocalLength(1.5, 140, 63);
    const near = estimateDistance({ ipdPixels: 140, focalLengthPx: f, assumedIPDmm: 63 });
    const far = estimateDistance({ ipdPixels: 95, focalLengthPx: f, assumedIPDmm: 63 });
    expect(far.distanceM).toBeGreaterThan(near.distanceM);
  });
});

describe("adaptive staircase", () => {
  it("decreases logMAR (harder) after a correct response", () => {
    const state = createStaircase();
    const next = stepStaircase(state, true);
    expect(next.currentLogMAR).toBeLessThan(state.currentLogMAR);
  });

  it("increases logMAR (easier) after an incorrect response", () => {
    const state = createStaircase();
    const next = stepStaircase(state, false);
    expect(next.currentLogMAR).toBeGreaterThan(state.currentLogMAR);
  });

  it("counts a reversal when direction changes", () => {
    let state = createStaircase();
    state = stepStaircase(state, true); // down
    expect(state.reversals).toBe(0);
    state = stepStaircase(state, false); // up -> reversal
    expect(state.reversals).toBe(1);
  });

  it("terminates after the configured number of reversals or trial cap", () => {
    let state = createStaircase();
    let correct = true;
    for (let i = 0; i < 60 && !state.finished; i++) {
      state = stepStaircase(state, correct);
      correct = !correct; // alternate to rack up reversals quickly
    }
    expect(state.finished).toBe(true);
  });
});

describe("orientation randomization", () => {
  it("never repeats the immediately previous orientation", () => {
    let prev: 0 | 90 | 180 | 270 | null = null;
    for (let i = 0; i < 100; i++) {
      const next = pickRandomOrientation(prev);
      if (prev !== null) expect(next).not.toBe(prev);
      prev = next;
    }
  });
});

describe("distance smoothing", () => {
  it("converges toward a steady input", () => {
    const smoother = new DistanceSmoother(0.3, 10);
    let last = 0;
    for (let i = 0; i < 30; i++) {
      last = smoother.push(1.5).smoothed;
    }
    expect(last).toBeCloseTo(1.5, 2);
  });

  it("dampens a single-frame outlier relative to raw jump", () => {
    const smoother = new DistanceSmoother(0.3, 10);
    for (let i = 0; i < 10; i++) smoother.push(1.5);
    const result = smoother.push(1.5); // establish baseline more
    void result;
    const jumped = smoother.push(5.0); // sudden implausible jump
    expect(jumped.smoothed).toBeLessThan(5.0);
    expect(jumped.smoothed).toBeGreaterThan(1.5);
  });
});
