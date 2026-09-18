/**
 * faceLandmarker.ts
 * -----------------------------------------------------------------------
 * Thin wrapper around MediaPipe's FaceLandmarker (tasks-vision). Handles
 * model loading (via CDN-hosted WASM + task file, cached by the browser)
 * and per-frame inference. Keeps all MediaPipe-specific plumbing out of
 * React components.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// MediaPipe ships its WASM runtime and model files from a CDN. Hosting the
// ~15MB task file locally is possible (see public/models/) but the CDN
// path works out-of-the-box and is what we default to.
const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerInstance: FaceLandmarker | null = null;
let loadingPromise: Promise<FaceLandmarker> | null = null;

/**
 * Lazily create (once) and return the shared FaceLandmarker instance,
 * configured for VIDEO running mode with blendshapes/transform matrices
 * enabled (transform matrices are used for head-pose estimation).
 */
export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 2, // detect up to 2 so we can warn the user about multiple faces
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
    landmarkerInstance = landmarker;
    return landmarker;
  })();

  return loadingPromise;
}

export function disposeFaceLandmarker(): void {
  landmarkerInstance?.close();
  landmarkerInstance = null;
  loadingPromise = null;
}

/**
 * Run inference on a single video frame. `timestampMs` must be
 * monotonically increasing per MediaPipe's VIDEO mode contract.
 */
export function detectForVideo(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): FaceLandmarkerResult {
  return landmarker.detectForVideo(video, timestampMs);
}

export type { FaceLandmarkerResult };
