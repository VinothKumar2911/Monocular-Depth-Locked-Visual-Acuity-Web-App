/**
 * eyeTracking.ts
 * -----------------------------------------------------------------------
 * Extracts stable eye/iris landmark positions from a MediaPipe
 * FaceLandmarker result and calculates pixel interpupillary distance
 * (IPD).
 *
 * LANDMARK INDICES USED (MediaPipe FaceMesh, 478-point topology which
 * includes refined iris landmarks):
 *   - Right iris center:  468
 *   - Left iris center:   473
 *   - Right eye corners:  33 (outer), 133 (inner)
 *   - Left eye corners:   362 (inner), 263 (outer)
 *
 * We prefer the IRIS CENTER landmarks (468 / 473) over eye-corner
 * landmarks because the iris center is a physically well-defined point
 * (roughly the pupil) and is comparatively stable under small head
 * rotations and blinking. Eye-corner landmarks are used only as a
 * fallback if iris landmarks are unavailable, and as an input to blink /
 * eye-openness sanity checks.
 */
import type { FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { euclideanDistance2D } from "../utils/math";

export const LANDMARK_INDICES = {
  rightIrisCenter: 468,
  leftIrisCenter: 473,
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
} as const;

export interface EyePoint {
  x: number; // pixel space
  y: number;
  z: number; // normalized depth (relative), for reference only
}

export interface EyeTrackingResult {
  leftEye: EyePoint;
  rightEye: EyePoint;
  ipdPixels: number;
  /** Simple heuristic confidence in [0,1] based on landmark presence and plausibility. */
  confidence: number;
  faceCount: number;
}

function toPixel(landmark: NormalizedLandmark, width: number, height: number): EyePoint {
  return { x: landmark.x * width, y: landmark.y * height, z: landmark.z };
}

/**
 * Calculate pixel interpupillary distance from two eye points.
 *   IPD_pixels = sqrt((x_right - x_left)^2 + (y_right - y_left)^2)
 */
export function calculatePixelIPD(leftEye: EyePoint, rightEye: EyePoint): number {
  return euclideanDistance2D(leftEye, rightEye);
}

/**
 * Extract eye-center landmarks and pixel IPD from a raw FaceLandmarker
 * result. `videoWidth`/`videoHeight` are the source frame dimensions
 * (landmarks are normalized 0..1 and must be scaled to pixel space).
 *
 * Returns null if no face (or no usable eye landmarks) was detected.
 */
export function extractEyeTracking(
  result: FaceLandmarkerResult,
  videoWidth: number,
  videoHeight: number,
): EyeTrackingResult | null {
  const faceCount = result.faceLandmarks?.length ?? 0;
  if (faceCount === 0) return null;

  // Always use the first detected face for the primary measurement; the
  // caller is responsible for warning the user if faceCount > 1.
  const landmarks = result.faceLandmarks[0];
  const { rightIrisCenter, leftIrisCenter, rightEyeOuter, rightEyeInner, leftEyeInner, leftEyeOuter } =
    LANDMARK_INDICES;

  const hasIris = landmarks.length > leftIrisCenter;

  let leftEye: EyePoint;
  let rightEye: EyePoint;
  let confidence = 1.0;

  if (hasIris) {
    leftEye = toPixel(landmarks[leftIrisCenter], videoWidth, videoHeight);
    rightEye = toPixel(landmarks[rightIrisCenter], videoWidth, videoHeight);
  } else {
    // Fallback: average of inner/outer eye corners approximates eye center.
    confidence *= 0.7; // less reliable than true iris center
    const lOuter = toPixel(landmarks[leftEyeOuter], videoWidth, videoHeight);
    const lInner = toPixel(landmarks[leftEyeInner], videoWidth, videoHeight);
    const rOuter = toPixel(landmarks[rightEyeOuter], videoWidth, videoHeight);
    const rInner = toPixel(landmarks[rightEyeInner], videoWidth, videoHeight);
    leftEye = { x: (lOuter.x + lInner.x) / 2, y: (lOuter.y + lInner.y) / 2, z: (lOuter.z + lInner.z) / 2 };
    rightEye = { x: (rOuter.x + rInner.x) / 2, y: (rOuter.y + rInner.y) / 2, z: (rOuter.z + rInner.z) / 2 };
  }

  const ipdPixels = calculatePixelIPD(leftEye, rightEye);

  // Sanity-check: IPD should be a plausible fraction of frame width.
  // Wildly small/large values indicate a bad detection; reduce confidence.
  const ipdFractionOfWidth = ipdPixels / videoWidth;
  if (ipdFractionOfWidth < 0.03 || ipdFractionOfWidth > 0.6) {
    confidence *= 0.3;
  }

  if (faceCount > 1) {
    confidence *= 0.5; // ambiguous which face is the subject
  }

  return { leftEye, rightEye, ipdPixels, confidence, faceCount };
}
