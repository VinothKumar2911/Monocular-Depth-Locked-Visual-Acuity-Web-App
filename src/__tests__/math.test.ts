import { describe, it, expect } from "vitest";
import {
  arcMinToRad,
  requiredOptotypeHeight,
  actualVisualAngle,
  radToArcMin,
  pinholeDistance,
  solveFocalLength,
  absoluteError,
  meanAbsoluteError,
  rootMeanSquareError,
} from "../utils/math";

describe("visual angle math (section 15 example calculations)", () => {
  const theta = arcMinToRad(5);

  it("~2.18mm optotype height at 1.50m", () => {
    const hMM = requiredOptotypeHeight(1.5 * 1000, theta);
    expect(hMM).toBeCloseTo(2.18, 1);
  });

  it("~3.20mm optotype height at 2.20m", () => {
    const hMM = requiredOptotypeHeight(2.2 * 1000, theta);
    expect(hMM).toBeCloseTo(3.2, 1);
  });

  it("~4.36mm optotype height at 3.00m", () => {
    const hMM = requiredOptotypeHeight(3.0 * 1000, theta);
    expect(hMM).toBeCloseTo(4.36, 1);
  });

  it("round-trips height -> angle back to ~5 arcmin", () => {
    const hMM = requiredOptotypeHeight(1.5 * 1000, theta);
    const angleRad = actualVisualAngle(hMM, 1.5 * 1000);
    expect(radToArcMin(angleRad)).toBeCloseTo(5, 5);
  });
});

describe("pinhole distance / focal length calibration", () => {
  it("solves focal length then recovers the same distance", () => {
    const knownDistanceMM = 1500;
    const measuredPx = 140;
    const realIPDmm = 63;
    const f = solveFocalLength(knownDistanceMM, measuredPx, realIPDmm);
    const recoveredDistance = pinholeDistance(f, realIPDmm, measuredPx);
    expect(recoveredDistance).toBeCloseTo(knownDistanceMM, 5);
  });
});

describe("validation error metrics (section 45 example)", () => {
  it("actual=1.50, estimated=1.53 -> error=0.03", () => {
    expect(absoluteError(1.53, 1.5)).toBeCloseTo(0.03, 5);
  });

  it("MAE and RMSE over multiple points", () => {
    const actual = [1.5, 2.2, 3.0];
    const estimated = [1.52, 2.23, 3.06];
    expect(meanAbsoluteError(estimated, actual)).toBeCloseTo(0.0367, 3);
    expect(rootMeanSquareError(estimated, actual)).toBeGreaterThan(0);
  });
});
