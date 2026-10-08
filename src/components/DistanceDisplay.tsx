/**
 * DistanceDisplay.tsx
 * -----------------------------------------------------------------------
 * Compact stat card showing the current smoothed distance estimate plus
 * confidence, for use on non-debug pages.
 */
import { useVision } from "../context/VisionContext";

export default function DistanceDisplay() {
  const { tracking } = useVision();
  const distance = tracking.smoothedDistanceM;
  const confidence = tracking.eye?.confidence ?? 0;

  return (
    <div className="stat-card">
      <div className="stat-label">Estimated Distance</div>
      <div className="stat-value">{distance ? `${distance.toFixed(2)} m` : "—"}</div>
      <div className="stat-sub">Tracking confidence: {Math.round(confidence * 100)}%</div>
    </div>
  );
}
