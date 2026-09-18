import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVision } from "../context/VisionContext";
import TumblingE from "../components/TumblingE";
import DirectionButtons from "../components/DirectionButtons";
import DebugPanel from "../components/DebugPanel";
import { isFullyCalibrated, loadScreenCalibration } from "../calibration/calibrationStorage";
import { computeOptotypeSize, shouldResize } from "../visionAcuity/optotypeSizing";
import { createStaircase, stepStaircase, pickRandomOrientation, type Orientation } from "../visionAcuity/staircase";
import { saveTrial } from "../utils/storage";
import { CONFIG } from "../config";

function newSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VisualAcuityTest() {
  const { cameraStatus, startCamera, tracking } = useVision();
  const navigate = useNavigate();

  const calibrated = isFullyCalibrated();
  const screenCal = loadScreenCalibration();

  const [started, setStarted] = useState(false);
  const [staircase, setStaircase] = useState(createStaircase());
  const [orientation, setOrientation] = useState<Orientation>(0);
  const [showDebug, setShowDebug] = useState(false);
  const [tracked, setTracked] = useState(true);
  const [trialStartTime, setTrialStartTime] = useState<number>(0);
  const [lastRenderedDistance, setLastRenderedDistance] = useState<number | null>(null);
  const [renderedSizePX, setRenderedSizePX] = useState<number | null>(null);

  const sessionIdRef = useRef<string>(newSessionId());
  const containerRef = useRef<HTMLDivElement>(null);

  // Tracking-loss detection: pause the test if face/distance is unreliable.
  useEffect(() => {
    if (!started) return;
    const distanceOk = tracking.smoothedDistanceM !== null;
    const poseOk = tracking.headPose?.withinTolerance ?? true;
    const faceOk = !!tracking.eye && (tracking.eye.faceCount ?? 0) <= 1;
    setTracked(distanceOk && poseOk && faceOk);
  }, [started, tracking]);

  // Dynamic resizing: recompute optotype size whenever distance changes
  // enough to matter (gated by shouldResize to avoid visible jitter).
  useEffect(() => {
    if (!started || !screenCal || tracking.smoothedDistanceM === null) return;
    const distance = tracking.smoothedDistanceM;
    if (shouldResize(distance, lastRenderedDistance)) {
      const { heightPX } = computeOptotypeSize(distance, screenCal, staircase.currentLogMAR);
      setRenderedSizePX(heightPX);
      setLastRenderedDistance(distance);
    }
  }, [tracking.smoothedDistanceM, started, screenCal, staircase.currentLogMAR, lastRenderedDistance]);

  const beginTest = async () => {
    if (containerRef.current?.requestFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
      } catch {
        // Fullscreen not available/denied — continue anyway.
      }
    }
    sessionIdRef.current = newSessionId();
    setStaircase(createStaircase());
    setOrientation(pickRandomOrientation(null));
    setLastRenderedDistance(null);
    setStarted(true);
    setTrialStartTime(performance.now());
  };

  const exitTest = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setStarted(false);
  };

  const handleAnswer = async (response: Orientation) => {
    if (!tracked || tracking.smoothedDistanceM === null || !screenCal) return;

    const correct = response === orientation;
    const reactionTimeMs = performance.now() - trialStartTime;
    const { heightMM, heightPX } = computeOptotypeSize(tracking.smoothedDistanceM, screenCal, staircase.currentLogMAR);

    await saveTrial({
      sessionId: sessionIdRef.current,
      trial: staircase.trial + 1,
      timestamp: new Date().toISOString(),
      distanceMeters: tracking.smoothedDistanceM,
      optotypeHeightMM: heightMM,
      optotypePixels: heightPX,
      orientation,
      response,
      correct,
      reactionTimeMs,
      logMAR: staircase.currentLogMAR,
    });

    const nextState = stepStaircase(staircase, correct);
    setStaircase(nextState);

    if (nextState.finished) {
      localStorage.setItem("mdva.lastSessionId", sessionIdRef.current);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      navigate("/results");
      return;
    }

    setOrientation(pickRandomOrientation(orientation));
    setTrialStartTime(performance.now());
  };

  const readiness = useMemo(
    () => ({
      camera: cameraStatus === "streaming",
      face: !!tracking.eye,
      calibration: calibrated,
      pose: tracking.headPose?.withinTolerance ?? false,
    }),
    [cameraStatus, tracking.eye, calibrated, tracking.headPose],
  );

  const readyToStart = readiness.camera && readiness.face && readiness.calibration;

  if (started) {
    return (
      <div className="test-screen" ref={containerRef}>
        <button className="btn btn-secondary test-exit" onClick={exitTest}>
          Exit Test
        </button>
        <div className="test-trial-counter">
          Trial {staircase.trial + 1} · Reversals {staircase.reversals}/{CONFIG.requiredReversals}
        </div>

        {!tracked ? (
          <div className="center">
            <h3>Tracking temporarily lost</h3>
            <p className="muted">
              {!tracking.eye
                ? "Please return to the correct position."
                : (tracking.eye?.faceCount ?? 0) > 1
                  ? "Only one face should be visible."
                  : "Please face the screen directly."}
            </p>
          </div>
        ) : (
          <>
            <div className="e-container">
              {renderedSizePX && <TumblingE size={renderedSizePX} rotation={orientation} />}
            </div>
            <DirectionButtons onAnswer={handleAnswer} />
          </>
        )}

        <label style={{ position: "absolute", bottom: 16, right: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} style={{ width: "auto" }} />
          <span className="small muted">Show Research Debug Data</span>
        </label>
        {showDebug && (
          <div style={{ position: "absolute", bottom: 48, right: 16, width: 340 }}>
            <DebugPanel />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="section-heading">
        <h2>Visual Acuity Test</h2>
      </div>
      <p className="muted">Experimental visual-acuity estimate. Not a substitute for a clinical eye exam.</p>

      <div className="card">
        <h3>Before starting, make sure:</h3>
        <ul className="step-list">
          <li className={readiness.camera ? "done" : ""}>
            <span className={`checkmark ${readiness.camera ? "done" : ""}`}>{readiness.camera ? "✓" : ""}</span>
            Camera is working
          </li>
          <li className={readiness.face ? "done" : ""}>
            <span className={`checkmark ${readiness.face ? "done" : ""}`}>{readiness.face ? "✓" : ""}</span>
            Face is detected
          </li>
          <li className={readiness.calibration ? "done" : ""}>
            <span className={`checkmark ${readiness.calibration ? "done" : ""}`}>{readiness.calibration ? "✓" : ""}</span>
            Calibration is complete
          </li>
          <li className={readiness.pose ? "done" : ""}>
            <span className={`checkmark ${readiness.pose ? "done" : ""}`}>{readiness.pose ? "✓" : ""}</span>
            You are facing the screen
          </li>
        </ul>

        {!readiness.camera && (
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={startCamera}>
            Start Camera
          </button>
        )}

        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn btn-primary btn-lg" disabled={!readyToStart} onClick={beginTest}>
            Enter Fullscreen &amp; Start Test
          </button>
        </div>
        {!readiness.calibration && (
          <p className="muted small" style={{ marginTop: 10 }}>
            Calibration is missing. Please complete the <a href="/calibration">Calibration</a> page first.
          </p>
        )}
      </div>
    </div>
  );
}
