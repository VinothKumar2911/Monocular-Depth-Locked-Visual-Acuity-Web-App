/**
 * headPose.ts
 * -----------------------------------------------------------------------
 * Estimates head yaw/pitch/roll from the 4x4 facial transformation matrix
 * that MediaPipe FaceLandmarker can optionally output
 * (outputFacialTransformationMatrixes: true). This matrix maps the
 * canonical face model into camera space, so its rotation component
 * gives us head orientation directly — no separate PnP solve needed.
 *
 * Convention: matrix is column-major, 4x4, row-major storage per
 * MediaPipe's `Matrix` type (data laid out row by row, length 16).
 */
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { radToDeg } from "../utils/math";
import { CONFIG } from "../config";

export interface HeadPose {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  withinTolerance: boolean;
}

/**
 * Decompose rotation angles (in degrees) from a row-major 4x4 matrix
 * (array of 16 numbers, row-major: m[row*4+col]).
 * Uses a standard Euler extraction for a Y-X-Z (yaw-pitch-roll) rotation
 * order, which matches typical face-orientation conventions.
 */
function decomposeRotationMatrix(m: number[]): { yawDeg: number; pitchDeg: number; rollDeg: number } {
  // Rotation submatrix R (3x3), row-major indices into the 4x4 array:
  const r00 = m[0], r01 = m[1], r02 = m[2];
  const r10 = m[4], r11 = m[5], r12 = m[6];
  const r20 = m[8], r21 = m[9], r22 = m[10];

  // yaw (Y), pitch (X), roll (Z) extraction
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r21)));
  let yaw: number;
  let roll: number;
  const cosPitch = Math.cos(pitch);
  if (Math.abs(cosPitch) > 1e-6) {
    yaw = Math.atan2(r20, r22);
    roll = Math.atan2(r01, r11);
  } else {
    // Gimbal lock fallback
    yaw = Math.atan2(-r02, r00);
    roll = 0;
  }

  void r10; void r12; // (unused components of R, kept for readability/reference)

  return { yawDeg: radToDeg(yaw), pitchDeg: radToDeg(pitch), rollDeg: radToDeg(roll) };
}

export function estimateHeadPose(result: FaceLandmarkerResult): HeadPose | null {
  const matrices = result.facialTransformationMatrixes;
  if (!matrices || matrices.length === 0) return null;

  const matrixData = matrices[0].data; // Float32Array length 16, row-major
  const { yawDeg, pitchDeg, rollDeg } = decomposeRotationMatrix(Array.from(matrixData));

  const withinTolerance =
    Math.abs(yawDeg) <= CONFIG.maxAllowedYawDeg &&
    Math.abs(pitchDeg) <= CONFIG.maxAllowedPitchDeg &&
    Math.abs(rollDeg) <= CONFIG.maxAllowedRollDeg;

  return { yawDeg, pitchDeg, rollDeg, withinTolerance };
}
