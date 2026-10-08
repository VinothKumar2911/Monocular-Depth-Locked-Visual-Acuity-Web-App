/**
 * cameraCalibration.ts
 * -----------------------------------------------------------------------
 * Manages the personal camera-calibration workflow: collecting
 * (known distance, measured pixel IPD) pairs and deriving the effective
 * focal length used by distanceEstimator.ts.
 */
import { calibrateFocalLengthMultiPoint } from "../vision/distanceEstimator";
import { CONFIG } from "../config";

export interface CalibrationPoint {
  distanceM: number;
  measuredIPDpx: number;
  sampleCount: number;
}

export type CalibrationMethod = "personal" | "statistical";

export interface CameraCalibration {
  method: CalibrationMethod;
  assumedIPDmm: number;
  knownDistances: number[];
  measuredIPD: number[];
  focalLengthPx: number;
  calibratedAt: string;
  /** camera-to-screen physical offset, in mm, along screen normal /
   *  vertical axis (see section 12 of the master prompt). 0 = camera
   *  assumed to be at the screen plane (typical laptop webcam). */
  cameraOffsetMM: { horizontal: number; vertical: number };
}

/**
 * Given calibration points collected from the UI, produce a
 * CameraCalibration record with a derived focal length.
 */
export function buildCameraCalibration(
  points: CalibrationPoint[],
  assumedIPDmm: number = CONFIG.defaultIPDmm,
  method: CalibrationMethod = "personal",
  cameraOffsetMM = { horizontal: 0, vertical: 0 },
): CameraCalibration {
  const focalLengthPx = calibrateFocalLengthMultiPoint(
    points.map((p) => ({ distanceM: p.distanceM, ipdPixels: p.measuredIPDpx })),
    assumedIPDmm,
  );

  return {
    method,
    assumedIPDmm,
    knownDistances: points.map((p) => p.distanceM),
    measuredIPD: points.map((p) => p.measuredIPDpx),
    focalLengthPx,
    calibratedAt: new Date().toISOString(),
    cameraOffsetMM,
  };
}

/**
 * Fallback "statistical" calibration for quick demo use when the user
 * skips personal calibration. Uses a rough, commonly-cited effective
 * focal length ratio for typical laptop webcams (~1280px wide sensor
 * output, ~60-70° horizontal FOV) — this is intentionally approximate
 * and clearly labeled as a default/demo value, never presented as
 * "calibrated" in the UI.
 */
export function defaultUncalibratedFocalLengthPx(videoWidthPx: number): number {
  // Empirical rough approximation: focal length (px) ≈ 0.9 × frame width
  // for a ~60° horizontal FOV webcam. This is ONLY a placeholder for demo
  // mode and should never be used for validation/research results.
  return videoWidthPx * 0.9;
}
