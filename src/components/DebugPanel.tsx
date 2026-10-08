/**
 * DebugPanel.tsx
 * -----------------------------------------------------------------------
 * Real-time research/debug readout (MASTER PROMPT section 19). Toggled
 * on/off by the parent page via a "Show Research Debug Data" control.
 */
import { useVision } from "../context/VisionContext";
import { loadCameraCalibration, loadScreenCalibration } from "../calibration/calibrationStorage";
import { requiredOptotypeHeightMM } from "../visionAcuity/visualAngle";
import { mmToPixels } from "../calibration/screenCalibration";
import { CONFIG } from "../config";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function DebugPanel() {
  const { tracking } = useVision();
  const screenCal = loadScreenCalibration();
  const cameraCal = loadCameraCalibration();

  const distance = tracking.smoothedDistanceM;
  const targetHeightMM = distance ? requiredOptotypeHeightMM(distance) : null;
  const targetHeightPX = targetHeightMM && screenCal ? mmToPixels(targetHeightMM, screenCal) : null;

  return (
    <div className="debug-panel">
      <div className="section-title">Camera</div>
      <Row label="Camera FPS" value={String(tracking.fps)} />
      <Row label="Face detected" value={tracking.eye ? "YES" : "NO"} />
      <Row label="Eye tracking" value={tracking.eye ? "YES" : "NO"} />
      <Row label="Confidence" value={tracking.eye ? tracking.eye.confidence.toFixed(2) : "—"} />

      <div className="section-title">Interpupillary Distance</div>
      <Row label="Raw IPD" value={tracking.eye ? `${tracking.eye.ipdPixels.toFixed(1)} px` : "—"} />

      <div className="section-title">Distance</div>
      <Row label="Raw distance" value={tracking.rawDistanceM ? `${tracking.rawDistanceM.toFixed(3)} m` : "—"} />
      <Row label="Smoothed distance" value={tracking.smoothedDistanceM ? `${tracking.smoothedDistanceM.toFixed(3)} m` : "—"} />
      <Row label="Window std-dev" value={tracking.distanceStdDevM ? `${(tracking.distanceStdDevM * 100).toFixed(2)} cm` : "—"} />

      <div className="section-title">Head Pose</div>
      <Row label="Yaw" value={tracking.headPose ? `${tracking.headPose.yawDeg.toFixed(1)}°` : "—"} />
      <Row label="Pitch" value={tracking.headPose ? `${tracking.headPose.pitchDeg.toFixed(1)}°` : "—"} />
      <Row label="Roll" value={tracking.headPose ? `${tracking.headPose.rollDeg.toFixed(1)}°` : "—"} />

      <div className="section-title">Optotype Target</div>
      <Row label="Target visual angle" value={`${CONFIG.targetVisualAngleArcMin.toFixed(2)} arcmin`} />
      <Row label="Target E height" value={targetHeightMM ? `${targetHeightMM.toFixed(2)} mm` : "—"} />
      <Row label="Target E pixels" value={targetHeightPX ? `${targetHeightPX.toFixed(2)} px` : "—"} />

      <div className="section-title">Calibration</div>
      <Row label="Screen calibration" value={screenCal ? `${screenCal.pixelsPerMM.toFixed(2)} px/mm` : "Not calibrated"} />
      <Row label="Camera calibration" value={cameraCal ? `f=${cameraCal.focalLengthPx.toFixed(1)}px (${cameraCal.method})` : "Not calibrated"} />
      <Row label="Rendering" value="SVG" />
    </div>
  );
}
