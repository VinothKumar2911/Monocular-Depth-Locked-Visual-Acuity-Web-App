/**
 * VisionContext.tsx
 * -----------------------------------------------------------------------
 * Owns the webcam stream, the MediaPipe inference loop, and the derived
 * tracking state (eye positions, IPD, head pose, smoothed distance).
 * Mounted once near the app root so tracking state survives navigation
 * between Camera Setup / Calibration / Test / Validation pages.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getFaceLandmarker, detectForVideo } from "../vision/faceLandmarker";
import { extractEyeTracking, type EyeTrackingResult } from "../vision/eyeTracking";
import { estimateHeadPose, type HeadPose } from "../vision/headPose";
import { estimateDistance } from "../vision/distanceEstimator";
import { DistanceSmoother } from "../vision/distanceSmoothing";
import { loadCameraCalibration } from "../calibration/calibrationStorage";
import { defaultUncalibratedFocalLengthPx } from "../calibration/cameraCalibration";
import { CONFIG } from "../config";

export type CameraStatus = "idle" | "requesting" | "streaming" | "denied" | "unsupported" | "error";

export interface TrackingSnapshot {
  eye: EyeTrackingResult | null;
  headPose: HeadPose | null;
  rawDistanceM: number | null;
  smoothedDistanceM: number | null;
  distanceStdDevM: number | null;
  fps: number;
  videoWidth: number;
  videoHeight: number;
  observedAtMs: number | null;
}

interface VisionContextValue {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  attachVideo: (video: HTMLVideoElement | null) => void;
  cameraStatus: CameraStatus;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  tracking: TrackingSnapshot;
  smoothingAlpha: number;
  setSmoothingAlpha: (alpha: number) => void;
  modelLoading: boolean;
  modelError: string | null;
}

const initialTracking: TrackingSnapshot = {
  eye: null,
  headPose: null,
  rawDistanceM: null,
  smoothedDistanceM: null,
  distanceStdDevM: null,
  fps: 0,
  videoWidth: 0,
  videoHeight: 0,
  observedAtMs: null,
};

const VisionContext = createContext<VisionContextValue | null>(null);

export function VisionProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smootherRef = useRef(new DistanceSmoother(CONFIG.defaultSmoothingAlpha));
  const fpsFramesRef = useRef<number[]>([]);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [tracking, setTracking] = useState<TrackingSnapshot>(initialTracking);
  const [smoothingAlpha, setSmoothingAlphaState] = useState<number>(CONFIG.defaultSmoothingAlpha);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) return;

    video.srcObject = stream;
    void video.play().catch((err) => {
      console.error("Camera preview playback error:", err);
    });
  }, []);

  const setSmoothingAlpha = useCallback((alpha: number) => {
    setSmoothingAlphaState(alpha);
    smootherRef.current.setAlpha(alpha);
  }, []);

  const runLoop = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }

    try {
      const landmarker = await getFaceLandmarker();
      const now = performance.now();
      const result = detectForVideo(landmarker, video, now);

      const eye = extractEyeTracking(result, video.videoWidth, video.videoHeight);
      const headPose = estimateHeadPose(result);

      let rawDistanceM: number | null = null;
      let smoothedDistanceM: number | null = null;
      let distanceStdDevM: number | null = null;

      if (eye) {
        const calibration = loadCameraCalibration();
        const focalLengthPx = calibration?.focalLengthPx ?? defaultUncalibratedFocalLengthPx(video.videoWidth);
        const assumedIPDmm = calibration?.assumedIPDmm ?? CONFIG.defaultIPDmm;

        const { distanceM } = estimateDistance({
          ipdPixels: eye.ipdPixels,
          focalLengthPx,
          assumedIPDmm,
        });
        rawDistanceM = distanceM;

        const smoothResult = smootherRef.current.push(distanceM);
        smoothedDistanceM = smoothResult.smoothed;
        distanceStdDevM = smoothResult.windowStdDev;
      }

      // FPS tracking over a rolling 1s window
      const nowSec = now / 1000;
      fpsFramesRef.current.push(nowSec);
      fpsFramesRef.current = fpsFramesRef.current.filter((t) => nowSec - t <= 1);

      setTracking({
        eye,
        headPose,
        rawDistanceM,
        smoothedDistanceM,
        distanceStdDevM,
        fps: fpsFramesRef.current.length,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        observedAtMs: now,
      });
    } catch (err) {
      console.error("Vision loop error:", err);
      setTracking({
        ...initialTracking,
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
        observedAtMs: performance.now(),
      });
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported");
      return;
    }
    setModelError(null);
    setCameraStatus("requesting");
    setModelLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: CONFIG.cameraIdealWidth },
          height: { ideal: CONFIG.cameraIdealHeight },
        },
        audio: false,
      });
      streamRef.current = stream;
      attachVideo(videoRef.current);
      if (videoRef.current) await videoRef.current.play();
      setCameraStatus("streaming");

      // Pre-load the model (also lazily loaded inside runLoop, but doing it
      // here surfaces load errors immediately with a clear status).
      await getFaceLandmarker();
      setModelLoading(false);
      smootherRef.current.reset();
      rafRef.current = requestAnimationFrame(runLoop);
    } catch (err) {
      setModelLoading(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setCameraStatus("denied");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setCameraStatus("unsupported");
      } else {
        console.error("Camera/model start error:", err);
        setModelError(err instanceof Error ? err.message : String(err));
        setCameraStatus("error");
      }
    }
  }, [runLoop]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus("idle");
    setTracking(initialTracking);
  }, []);

  // Calibration mounts the video after camera permission resolves. Reattach
  // the stream when that element becomes available.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (cameraStatus !== "streaming" || !video || !stream || video.srcObject === stream) return;

    video.srcObject = stream;
    void video.play().catch((err) => {
      console.error("Camera preview playback error:", err);
    });
  }, [cameraStatus]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: VisionContextValue = {
    videoRef,
    attachVideo,
    cameraStatus,
    startCamera,
    stopCamera,
    tracking,
    smoothingAlpha,
    setSmoothingAlpha,
    modelLoading,
    modelError,
  };

  return <VisionContext.Provider value={value}>{children}</VisionContext.Provider>;
}

export function useVision(): VisionContextValue {
  const ctx = useContext(VisionContext);
  if (!ctx) throw new Error("useVision must be used within a VisionProvider");
  return ctx;
}
