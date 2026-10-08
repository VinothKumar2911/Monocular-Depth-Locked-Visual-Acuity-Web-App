/**
 * monocularDepth.ts
 * -----------------------------------------------------------------------
 * OPTIONAL / EXPERIMENTAL comparison module.
 *
 * The primary distance-estimation pipeline of this application is the
 * IPD-geometry method (see distanceEstimator.ts) — it is fast, explains
 * itself mathematically, and needs no large model download. This module
 * exists only to support an OPTIONAL side-by-side research comparison
 * against a neural monocular depth model, per MASTER PROMPT sections
 * 41-42.
 *
 * NOT IMPLEMENTED BY DEFAULT: bundling a full depth model (Depth Anything,
 * ZoeDepth, Metric3D, etc.) adds tens-to-hundreds of MB and a heavy
 * TensorFlow.js/ONNX runtime dependency, which would contradict the
 * requirement that "the core project must work with face landmarks + IPD
 * geometry + calibration" and must not depend on a huge AI model.
 *
 * This file defines the STABLE INTERFACE the rest of the app expects, and
 * a clearly-labeled placeholder implementation so Research Comparison Mode
 * degrades gracefully ("Not available") instead of crashing. A future
 * contributor can implement `runMonocularDepthEstimate` against a real
 * TF.js/ONNX model without touching any other file.
 */

export interface MonocularDepthEstimate {
  /** Estimated distance in meters from the AI depth model, if available. */
  distanceM: number | null;
  /** Whether a real model produced this estimate, or this is a placeholder. */
  available: boolean;
  modelName: string | null;
  notes: string;
}

let modelLoaded = false;

/** Whether an actual depth model has been wired in. Always false until a
 *  contributor implements one (see file header). */
export function isMonocularDepthAvailable(): boolean {
  return modelLoaded;
}

/**
 * Placeholder entry point. Returns `available: false` and a null distance
 * rather than fabricating a number — per the project's "do not fake
 * results" requirement (MASTER PROMPT section 48).
 */
export async function runMonocularDepthEstimate(
  _video: HTMLVideoElement,
): Promise<MonocularDepthEstimate> {
  return {
    distanceM: null,
    available: false,
    modelName: null,
    notes:
      "Experimental AI monocular-depth comparison is not bundled in this build. " +
      "Implement runMonocularDepthEstimate() against a TF.js/ONNX depth model to enable it.",
  };
}
