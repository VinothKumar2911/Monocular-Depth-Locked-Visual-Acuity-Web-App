/**
 * FaceStatus.tsx
 * -----------------------------------------------------------------------
 * Status-pill row summarizing camera/face/eye/tracking/distance state,
 * as specified in MASTER PROMPT section 5.
 */
import { useVision } from "../context/VisionContext";

function Pill({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: React.ReactNode }) {
  return <span className={`status-pill ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

export default function FaceStatus() {
  const { cameraStatus, tracking, modelLoading } = useVision();

  const faceDetected = !!tracking.eye;
  const multipleFaces = (tracking.eye?.faceCount ?? 0) > 1;
  const headPoseOk = tracking.headPose?.withinTolerance ?? null;

  return (
    <div>
      <div className="status-row">
        <Pill tone={cameraStatus === "streaming" ? "good" : cameraStatus === "denied" || cameraStatus === "error" ? "bad" : "warn"}>
          <span className="dot" /> Camera: {cameraStatus === "streaming" ? "Connected" : cameraStatus === "requesting" ? "Requesting…" : cameraStatus}
        </Pill>
        <Pill tone={modelLoading ? "warn" : "good"}>
          <span className="dot" /> Model: {modelLoading ? "Loading…" : "Ready"}
        </Pill>
        <Pill tone={faceDetected ? "good" : "bad"}>
          <span className="dot" /> Face: {faceDetected ? "Detected" : "Not detected"}
        </Pill>
        <Pill tone={faceDetected ? "good" : "bad"}>
          <span className="dot" /> Eyes: {faceDetected ? "Detected" : "Not detected"}
        </Pill>
        <Pill tone={headPoseOk === null ? "neutral" : headPoseOk ? "good" : "warn"}>
          <span className="dot" /> Head pose: {headPoseOk === null ? "—" : headPoseOk ? "Good" : "Turn to face camera"}
        </Pill>
        <Pill tone={tracking.smoothedDistanceM ? "good" : "neutral"}>
          <span className="dot" /> Distance: {tracking.smoothedDistanceM ? `${tracking.smoothedDistanceM.toFixed(2)} m` : "—"}
        </Pill>
        <Pill tone="neutral">
          <span className="dot" /> FPS: {tracking.fps}
        </Pill>
      </div>

      {cameraStatus === "streaming" && !faceDetected && (
        <p className="instruction-banner">Face not detected. Move into the camera frame.</p>
      )}
      {multipleFaces && <p className="instruction-banner">Please ensure that only one person is visible.</p>}
      {faceDetected && headPoseOk === false && <p className="instruction-banner">Please face the screen directly.</p>}
    </div>
  );
}
