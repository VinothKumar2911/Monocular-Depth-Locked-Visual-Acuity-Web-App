import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVision } from "../context/VisionContext";
import CameraPreview from "../components/CameraPreview";
import CalibrationCard from "../components/CalibrationCard";
import { buildCameraCalibration, type CalibrationPoint } from "../calibration/cameraCalibration";
import {
  saveCameraCalibration,
  saveScreenCalibration,
  loadScreenCalibration,
} from "../calibration/calibrationStorage";
import { computeScreenCalibration } from "../calibration/screenCalibration";
import { CONFIG } from "../config";

const CALIBRATION_DISTANCES = [1.5, 2.2, 3.0];

export default function Calibration() {
  const { cameraStatus, startCamera, modelLoading, modelError } = useVision();

  // ---- Camera calibration state ----
  const autoStartRequestedRef = useRef(false);
  const [points, setPoints] = useState<Record<number, CalibrationPoint>>({});
  const [assumedIPDmm, setAssumedIPDmm] = useState<number>(CONFIG.defaultIPDmm);
  const [cameraCalSaved, setCameraCalSaved] = useState(false);

  // ---- Screen calibration state ----
  const rulerRef = useRef<HTMLDivElement>(null);
  const [referenceSizeMM, setReferenceSizeMM] = useState(50);
  const [rulerPX, setRulerPX] = useState(150);
  const [screenCalSaved, setScreenCalSaved] = useState(!!loadScreenCalibration());
  const savedScreenCal = loadScreenCalibration();

  useEffect(() => {
    if (cameraStatus === "idle" && !autoStartRequestedRef.current) {
      autoStartRequestedRef.current = true;
      void startCamera();
    }
  }, [cameraStatus, startCamera]);

  const handleCapture = (distanceM: number) => (result: CalibrationPoint) => {
    setPoints((prev) => ({ ...prev, [distanceM]: result }));
    setCameraCalSaved(false);
  };

  const saveCamera = () => {
    const collected = Object.values(points);
    if (collected.length === 0) {
      alert("Capture at least one calibration distance first.");
      return;
    }
    const calibration = buildCameraCalibration(collected, assumedIPDmm, "personal");
    saveCameraCalibration(calibration);
    setCameraCalSaved(true);
  };

  const saveScreen = () => {
    if (!rulerRef.current) return;
    const displayedPX = rulerRef.current.getBoundingClientRect().width;
    const calibration = computeScreenCalibration(displayedPX, referenceSizeMM);
    saveScreenCalibration(calibration);
    setScreenCalSaved(true);
  };

  const bothDone = cameraCalSaved && screenCalSaved;

  return (
    <div className="page">
      <div className="section-heading">
        <h2>Calibration</h2>
      </div>

      {/* ---- Camera Calibration ---- */}
      <div className="card">
        <h3>Camera Calibration</h3>
        <p className="muted small">
          Sit at each known distance and capture a stable interpupillary-distance (IPD) measurement. This
          derives the camera's effective focal length used for distance estimation. Multiple points are
          averaged for a more robust result.
        </p>

        <CameraPreview />
        {cameraStatus !== "streaming" ? (
          <>
            {cameraStatus === "error" && (
              <p className="badge bad" role="alert">
                Camera or vision model failed to start{modelError ? `: ${modelError}` : "."}
              </p>
            )}
            {cameraStatus === "denied" && (
              <p className="badge bad" role="alert">
                Camera permission was denied. Allow camera access and try again.
              </p>
            )}
            {cameraStatus === "unsupported" && (
              <p className="badge bad" role="alert">
                This browser does not provide camera access.
              </p>
            )}
            <button className="btn btn-primary" onClick={startCamera} disabled={cameraStatus === "requesting"}>
              {cameraStatus === "requesting" ? "Starting Camera…" : "Start Camera to Begin Calibration"}
            </button>
          </>
        ) : (
          <>
            {modelLoading && <p className="instruction-banner">Loading face tracking model…</p>}
            {modelError && (
              <p className="badge bad" role="alert">
                Face tracking model failed to load: {modelError}
              </p>
            )}

            <div className="field" style={{ maxWidth: 320, marginTop: 16 }}>
              <label htmlFor="ipd">Assumed real-world IPD (mm)</label>
              <input
                id="ipd"
                type="number"
                value={assumedIPDmm}
                min={45}
                max={80}
                onChange={(e) => setAssumedIPDmm(Number(e.target.value))}
              />
              <p className="muted small" style={{ marginTop: 4 }}>
                Default {CONFIG.defaultIPDmm}mm is a population-average assumption (Mode B / statistical). For
                best accuracy, measure your own IPD with a ruler or optician's tool and enter it here (Mode A /
                personal).
              </p>
            </div>

            <div className="card-grid" style={{ marginTop: 8 }}>
              {CALIBRATION_DISTANCES.map((d, i) => (
                <CalibrationCard
                  key={d}
                  distanceM={d}
                  label={`Calibration Point ${i + 1}`}
                  done={!!points[d]}
                  onCapture={handleCapture(d)}
                />
              ))}
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={saveCamera} disabled={Object.keys(points).length === 0}>
                Save Camera Calibration
              </button>
              {cameraCalSaved && <span className="badge good">Camera calibration saved</span>}
            </div>
          </>
        )}
      </div>

      {/* ---- Screen Calibration ---- */}
      <div className="card">
        <h3>Screen Calibration</h3>
        <p className="muted small">
          Browsers cannot assume 1 CSS pixel = 1 physical pixel. Place a physical ruler against your screen and
          adjust the slider until the bar below measures exactly the entered reference size.
        </p>

        <div className="field">
          <label htmlFor="refsize">Physical reference size (mm)</label>
          <input id="refsize" type="number" value={referenceSizeMM} min={10} max={200} onChange={(e) => setReferenceSizeMM(Number(e.target.value))} />
        </div>

        <div className="field">
          <label htmlFor="rulerslider">Adjust bar width until it matches {referenceSizeMM}mm on your ruler</label>
          <input
            id="rulerslider"
            type="range"
            min={20}
            max={800}
            value={rulerPX}
            onChange={(e) => setRulerPX(Number(e.target.value))}
          />
        </div>

        <div
          aria-label={`On-screen ruler from 0 to ${referenceSizeMM} millimeters`}
          role="img"
          style={{
            position: "relative",
            width: rulerPX,
            maxWidth: "100%",
            height: 34,
            marginBottom: 8,
            borderBottom: "2px solid var(--text-muted)",
          }}
        >
          {Array.from({ length: 11 }, (_, index) => (
            <span
              key={index}
              style={{
                position: "absolute",
                left: `${index * 10}%`,
                bottom: 0,
                width: 1,
                height: index % 5 === 0 ? 18 : 10,
                background: "var(--text-muted)",
              }}
            >
              {index % 5 === 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -18,
                    left: 3,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {Math.round((referenceSizeMM * index) / 10)}
                </span>
              )}
            </span>
          ))}
        </div>

        <div
          ref={rulerRef}
          style={{ width: rulerPX, height: 36, background: "var(--accent)", borderRadius: 6, marginBottom: 16 }}
        />

        <div className="btn-row">
          <button className="btn btn-primary" onClick={saveScreen}>
            Save Screen Calibration
          </button>
          {screenCalSaved && savedScreenCal && (
            <span className="badge good">Screen calibration: {savedScreenCal.pixelsPerMM.toFixed(2)} px/mm</span>
          )}
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 8 }}>
        <Link
          className={`btn ${bothDone ? "btn-primary" : "btn-secondary"}`}
          to="/test"
          onClick={(e) => {
            if (!bothDone) {
              e.preventDefault();
              alert("Please complete both camera and screen calibration before starting the test.");
            }
          }}
        >
          Continue to Visual Acuity Test
        </Link>
      </div>
    </div>
  );
}
