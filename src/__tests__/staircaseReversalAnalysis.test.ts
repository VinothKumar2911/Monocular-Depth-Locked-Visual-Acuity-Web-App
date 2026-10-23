import { describe, it, expect } from "vitest";
import {
  psychometricP,
  simulateSingleStaircase,
  runStaircaseReversalAnalysis,
} from "../visionAcuity/staircaseReversalAnalysis";
import { createMulberry32 } from "../vision/syntheticParticipantSimulator";

describe("Psychometric observer response model", () => {
  const trueLogMAR = 0.0; // 20/20 threshold

  it("yields high probability of correct response for easy large optotypes (e.g. 1.0 logMAR)", () => {
    const pEasy = psychometricP(1.0, trueLogMAR);
    expect(pEasy).toBeGreaterThan(0.95);
  });

  it("yields ~60% probability at the true threshold", () => {
    const pThresh = psychometricP(0.0, trueLogMAR);
    // 0.25 + (1 - 0.25 - 0.02) * 0.5 = 0.25 + 0.365 = 0.615
    expect(pThresh).toBeCloseTo(0.615, 2);
  });

  it("approaches chance level (25%) for tiny unresolvable optotypes (e.g. -0.5 logMAR)", () => {
    const pHard = psychometricP(-0.5, trueLogMAR);
    expect(pHard).toBeCloseTo(0.25, 1);
  });
});

describe("Staircase stopping limits and scoring comparison (Feature 5)", () => {
  it("stops at target reversals or trial cap (whichever comes first)", () => {
    const rng = createMulberry32(42);

    for (const targetReversals of [4, 6, 8, 10]) {
      const run = simulateSingleStaircase(targetReversals, 0.0, rng, 40);
      expect(run.trialCount).toBeLessThanOrEqual(40);
      expect(run.achievedReversals).toBeLessThanOrEqual(targetReversals);
      if (run.completedByReversals) {
        expect(run.achievedReversals).toBe(targetReversals);
      }
      expect(run.steps.length).toBe(run.trialCount);
    }
  });

  it("distinguishes Method 1 (Last-N trials) from Method 2 (Reversal points)", () => {
    const rng = createMulberry32(100);
    const run = simulateSingleStaircase(6, 0.0, rng, 40);

    expect(run.method1LogMAR).toBeDefined();
    expect(run.method2LogMAR).toBeDefined();
    expect(run.reversalPoints.length).toBe(run.achievedReversals);
  });

  it("runs full comparative reversal analysis across 4, 6, 8, and 10 reversals", () => {
    const report = runStaircaseReversalAnalysis(0.0, 20, 12345); // 20 runs for quick unit test

    expect(report.conditions.length).toBe(4);
    const reversalsTested = report.conditions.map((c) => c.targetReversals);
    expect(reversalsTested).toEqual([4, 6, 8, 10]);

    // Mean trials must increase monotonically with higher reversal criteria
    for (let i = 0; i < report.conditions.length - 1; i++) {
      expect(report.conditions[i].meanTrials).toBeLessThan(report.conditions[i + 1].meanTrials);
    }

    // Check report explanations
    expect(report.methodComparisonNotes).toContain("SCORING METHOD COMPARISON");
    expect(report.reversalTradeoffConclusion).toContain("REVERSAL TRADEOFF ANALYSIS");
  });
});
