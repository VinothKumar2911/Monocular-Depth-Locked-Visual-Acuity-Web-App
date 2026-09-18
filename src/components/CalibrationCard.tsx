/**
 * CalibrationCard.tsx
 * -----------------------------------------------------------------------
 * A single "sit at distance X and capture" step used by the Camera
 * Calibration page. Collects CONFIG.calibrationStableFrameCount samples
 * of pixel IPD while the user holds still, then reports the mean.
 */
import { useEffect, useRef, useState } from "react";
import { useVision } from "../context/VisionContext";
import { CONFIG } from "../config";
import { mean, stdDev } from "../utils/math";

export interface CalibrationCardProps {
  distanceM: number;
  label: string;
  done: boolean;
  onCapture: (result: { distanceM: number; measuredIPDpx: number; sampleCount: number }) => void;
}

export default function CalibrationCard({ distanceM, label, done, onCapture }: CalibrationCardProps) {
  const { tracking } = useVision();
  const [capturing, setCapturing] = useState(false);
  const samplesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!capturing) return;
    if (tracking.eye && tracking.eye.confidence > 0.5) {
      samplesRef.current.push(tracking.eye.ipdPixels);
    }
    if (samplesRef.current.length >= CONFIG.calibrationStableFrameCount) {
      const samples = samplesRef.current;
      const m = mean(samples);
      const sd = stdDev(samples);
      setCapturing(false);
      // Reject wildly unstable capture sessions (user likely moved).
      if (sd / m > 0.08) {
        samplesRef.current = [];
        alert("Measurement was too unstable. Please hold still and try again.");
        return;
      }
      onCapture({ distanceM, measuredIPDpx: m, sampleCount: samples.length });
      samplesRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.eye, capturing]);

  const progress = capturing ? Math.min(100, (samplesRef.current.length / CONFIG.calibrationStableFrameCount) * 100) : 0;

  return (
    <div className="card">
      <div className="flex-between">
        <div>
          <strong>{label}</strong>
          <div className="muted small">Target distance: {distanceM.toFixed(2)} m</div>
          <div className="muted small">
            Current distance: {tracking.smoothedDistanceM !== null ? `${tracking.smoothedDistanceM.toFixed(2)} m` : "—"}
          </div>
        </div>
        {done && <span className="badge good">Captured</span>}
      </div>

      <p className="muted small" style={{ marginTop: 10 }}>
        Sit exactly {distanceM.toFixed(2)} m from the camera, face forward, and hold still.
      </p>

      <div className="muted small" style={{ marginBottom: 10 }}>
        Measured IPD (live): {tracking.eye ? `${tracking.eye.ipdPixels.toFixed(1)} px` : "—"}
      </div>

      {capturing && (
        <div style={{ background: "var(--surface-alt)", borderRadius: 8, height: 8, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ background: "var(--accent)", height: "100%", width: `${progress}%`, transition: "width 0.15s" }} />
        </div>
      )}

      <button
        className="btn btn-secondary"
        disabled={capturing || !tracking.eye}
        onClick={() => {
          samplesRef.current = [];
          setCapturing(true);
        }}
      >
        {capturing ? "Capturing…" : done ? "Recapture" : "Capture"}
      </button>
    </div>
  );
}
