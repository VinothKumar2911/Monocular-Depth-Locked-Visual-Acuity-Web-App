import { useEffect, useRef, useState } from "react";
import { useVision } from "../context/VisionContext";
import CameraPreview from "../components/CameraPreview";
import { loadScreenCalibration } from "../calibration/calibrationStorage";
import { mmToPixels } from "../calibration/screenCalibration";
import { requiredOptotypeHeightMM, actualVisualAngleArcMin } from "../visionAcuity/visualAngle";
import { absoluteError, percentageError, mean, degToRad } from "../utils/math";
import { CONFIG } from "../config";
import { saveValidationRecord, getValidationRecords, type ValidationRecord } from "../utils/storage";
import { downloadCSV, downloadJSON } from "../utils/csvExport";
import TumblingE from "../components/TumblingE";
import DistanceSmoothingChart from "../components/DistanceSmoothingChart";
import { generateDemoTemporalSeries, type TemporalDistanceSample } from "../vision/distanceSmoothing";

const SESSION_ID = "validation-session";
const SAMPLE_DURATION_MS = 3000;

export default function Validation() {
  const { cameraStatus, startCamera, tracking, modelError } = useVision();
  const screenCal = loadScreenCalibration();
  const autoStartRequestedRef = useRef(false);
  const [actualDistanceInput, setActualDistanceInput] = useState(1.5);
  const [sampling, setSampling] = useState(false);
  const [records, setRecords] = useState<ValidationRecord[]>([]);
  const samplesRef = useRef<number[]>([]);
  const temporalSamplesRef = useRef<TemporalDistanceSample[]>([]);
  const samplingStartMsRef = useRef<number>(0);
  const [measuredOptotypeMM, setMeasuredOptotypeMM] = useState<string>("");
  const [chartMode, setChartMode] = useState<"recorded" | "benchmark">("recorded");

  useEffect(() => {
    if (cameraStatus === "idle" && !autoStartRequestedRef.current) {
      autoStartRequestedRef.current = true;
      void startCamera();
    }
  }, [cameraStatus, startCamera]);

  useEffect(() => {
    getValidationRecords(SESSION_ID).then(setRecords);
  }, []);

  useEffect(() => {
    if (!sampling) return;
    if (tracking.smoothedDistanceM !== null) {
      samplesRef.current.push(tracking.smoothedDistanceM);
    }
    if (tracking.rawDistanceM !== null && tracking.smoothedDistanceM !== null) {
      const now = performance.now();
      const elapsedSec = (now - samplingStartMsRef.current) / 1000;
      temporalSamplesRef.current.push({
        timeSec: Number(elapsedSec.toFixed(3)),
        rawDistanceM: tracking.rawDistanceM,
        smoothedDistanceM: tracking.smoothedDistanceM,
        referenceDistanceM: actualDistanceInput,
      });
    }
  }, [sampling, tracking.smoothedDistanceM, tracking.rawDistanceM, actualDistanceInput]);

  const runSample = () => {
    samplesRef.current = [];
    temporalSamplesRef.current = [];
    samplingStartMsRef.current = performance.now();
    setSampling(true);
    setTimeout(async () => {
      setSampling(false);
      const samples = samplesRef.current;
      if (samples.length === 0) {
        alert("No distance samples were captured. Make sure your face is tracked.");
        return;
      }
      const estimatedDistanceM = mean(samples);
      const errM = absoluteError(estimatedDistanceM, actualDistanceInput);
      const pctErr = percentageError(estimatedDistanceM, actualDistanceInput);
      const targetMM = requiredOptotypeHeightMM(actualDistanceInput);
      const renderedPX = screenCal ? mmToPixels(targetMM, screenCal) : NaN;

      const record: ValidationRecord = {
        sessionId: SESSION_ID,
        timestamp: new Date().toISOString(),
        actualDistanceM: actualDistanceInput,
        estimatedDistanceM,
        absoluteErrorM: errM,
        percentageError: pctErr,
        ipdPixels: tracking.eye?.ipdPixels ?? NaN,
        headYawDeg: tracking.headPose?.yawDeg ?? NaN,
        headPitchDeg: tracking.headPose?.pitchDeg ?? NaN,
        confidence: tracking.eye?.confidence ?? NaN,
        targetOptotypeMM: targetMM,
        renderedOptotypePX: renderedPX,
        measuredOptotypeMM: measuredOptotypeMM ? Number(measuredOptotypeMM) : null,
        passFail: errM <= CONFIG.targetDistanceToleranceM ? "PASS" : "FAIL",
        temporalSamples: [...temporalSamplesRef.current],
      };
      await saveValidationRecord(record);
      const all = await getValidationRecords(SESSION_ID);
      setRecords(all);
      setMeasuredOptotypeMM("");
    }, SAMPLE_DURATION_MS);
  };


  const estimatedList = records.map((r) => r.estimatedDistanceM);
  const actualList = records.map((r) => r.actualDistanceM);
  const mae = estimatedList.length ? mean(estimatedList.map((e, i) => absoluteError(e, actualList[i]))) : NaN;
  const rmse = estimatedList.length
    ? Math.sqrt(mean(estimatedList.map((e, i) => (e - actualList[i]) ** 2)))
    : NaN;
  const maxErr = estimatedList.length ? Math.max(...estimatedList.map((e, i) => absoluteError(e, actualList[i]))) : NaN;
  const withinToleranceCount = records.filter((r) => r.absoluteErrorM <= CONFIG.targetDistanceToleranceM).length;

  // Visual-angle validation panel, live.
  const liveDistance = tracking.smoothedDistanceM;
  const liveTargetMM = liveDistance ? requiredOptotypeHeightMM(liveDistance) : null;
  const liveTargetPX = liveTargetMM && screenCal ? mmToPixels(liveTargetMM, screenCal) : null;
  const liveActualAngle = liveTargetMM && liveDistance ? actualVisualAngleArcMin(liveTargetMM, liveDistance) : null;
  const latestRecord = records.length > 0 ? records[records.length - 1] : null;
  const latestCalculatedAngle = latestRecord
    ? actualVisualAngleArcMin(latestRecord.targetOptotypeMM, latestRecord.actualDistanceM)
    : null;
  const latestSizeDifference = latestRecord?.measuredOptotypeMM !== null && latestRecord
    ? Math.abs(latestRecord.measuredOptotypeMM - latestRecord.targetOptotypeMM)
    : null;
  void degToRad; // retained for potential future direct-angle entry field

  return (
    <div className="page wide">
      <div className="section-heading">
        <h2>Validation / Research Mode</h2>
      </div>
      <p className="muted">Compare webcam-estimated distance against a known physical distance (tape/laser measure).</p>

      {cameraStatus !== "streaming" && (
        <>
          {(cameraStatus === "denied" || cameraStatus === "unsupported" || cameraStatus === "error") && (
            <p className="badge bad" role="alert">
              {cameraStatus === "denied"
                ? "Camera permission was denied. Allow camera access and try again."
                : cameraStatus === "unsupported"
                  ? "This browser does not provide camera access."
                  : `Camera or vision model failed to start${modelError ? `: ${modelError}` : "."}`}
            </p>
          )}
          <button className="btn btn-primary" onClick={startCamera} disabled={cameraStatus === "requesting"}>
            {cameraStatus === "requesting" ? "Starting Camera…" : "Start Camera"}
          </button>
        </>
      )}

      {cameraStatus === "streaming" && (
        <div className="card-grid" style={{ alignItems: "start" }}>
          <div className="card">
            <CameraPreview />
          </div>

          <div className="card">
            <h3>Capture a Validation Point</h3>
            <div className="field">
              <label htmlFor="actualDist">Actual distance measured with tape/laser (m)</label>
              <input
                id="actualDist"
                type="number"
                step={0.01}
                value={actualDistanceInput}
                onChange={(e) => setActualDistanceInput(Number(e.target.value))}
              />
            </div>
            <p className="muted small">
              Live estimated distance: {liveDistance ? `${liveDistance.toFixed(3)} m` : "—"}
            </p>
            <button className="btn btn-primary" disabled={sampling} onClick={runSample}>
              {sampling ? "Sampling (3s)…" : "Record 3s of Measurements"}
            </button>

            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="measuredE">Measured optotype size with calipers/ruler (mm, optional)</label>
              <input id="measuredE" type="number" step={0.01} value={measuredOptotypeMM} onChange={(e) => setMeasuredOptotypeMM(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>1. Distance Validation</h3>
        <div className="card-grid">
          <div className="stat-card">
            <div className="stat-label">Actual distance</div>
            <div className="stat-value">{latestRecord ? `${latestRecord.actualDistanceM.toFixed(2)} m` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Estimated distance</div>
            <div className="stat-value">{latestRecord ? `${latestRecord.estimatedDistanceM.toFixed(2)} m` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Absolute error</div>
            <div className="stat-value">{latestRecord ? `${(latestRecord.absoluteErrorM * 100).toFixed(1)} cm` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Relative error</div>
            <div className="stat-value">{latestRecord ? `${latestRecord.percentageError.toFixed(2)}%` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Status</div>
            <div className="stat-value">
              {latestRecord ? <span className={`badge ${latestRecord.passFail === "PASS" ? "good" : "bad"}`}>{latestRecord.passFail}</span> : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>2. Visual-Angle Validation</h3>
        <p className="muted small">Live values use the current tracked distance. The latest recorded point is shown when available.</p>
        <div className="card-grid">
          <div className="stat-card">
            <div className="stat-label">Target angle</div>
            <div className="stat-value">{CONFIG.targetVisualAngleArcMin.toFixed(2)} arcmin</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Calculated angle</div>
            <div className="stat-value">
              {latestCalculatedAngle !== null ? `${latestCalculatedAngle.toFixed(2)} arcmin` : liveActualAngle ? `${liveActualAngle.toFixed(2)} arcmin` : "—"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Difference</div>
            <div className="stat-value">
              {latestCalculatedAngle !== null
                ? `${Math.abs(latestCalculatedAngle - CONFIG.targetVisualAngleArcMin).toFixed(2)} arcmin`
                : liveActualAngle
                  ? `${Math.abs(liveActualAngle - CONFIG.targetVisualAngleArcMin).toFixed(2)} arcmin`
                  : "—"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Rendered E (preview)</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 60 }}>
              {liveTargetPX ? <TumblingE size={Math.max(liveTargetPX, 8)} rotation={0} /> : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>3. Optotype Physical-Size Validation</h3>
        <div className="card-grid">
          <div className="stat-card">
            <div className="stat-label">Expected E height</div>
            <div className="stat-value">{latestRecord ? `${latestRecord.targetOptotypeMM.toFixed(2)} mm` : liveTargetMM ? `${liveTargetMM.toFixed(2)} mm` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Measured E height</div>
            <div className="stat-value">{latestRecord?.measuredOptotypeMM !== null && latestRecord ? `${latestRecord.measuredOptotypeMM.toFixed(2)} mm` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Difference</div>
            <div className="stat-value">{latestSizeDifference !== null ? `${latestSizeDifference.toFixed(2)} mm` : "—"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between">
          <h3>4. Summary</h3>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => downloadCSV("validation-report.csv", records)}>
              Download CSV
            </button>
            <button className="btn btn-secondary" onClick={() => downloadJSON("validation-report.json", records)}>
              Download JSON
            </button>
          </div>
        </div>

        <div className="card-grid">
          <div className="stat-card">
            <div className="stat-label">Number of measurements</div>
            <div className="stat-value">{records.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">MAE</div>
            <div className="stat-value">{Number.isFinite(mae) ? `${(mae * 100).toFixed(1)} cm` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">RMSE</div>
            <div className="stat-value">{Number.isFinite(rmse) ? `${(rmse * 100).toFixed(1)} cm` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Maximum error</div>
            <div className="stat-value">{Number.isFinite(maxErr) ? `${(maxErr * 100).toFixed(1)} cm` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Within ±3 cm</div>
            <div className="stat-value">{withinToleranceCount} / {records.length}</div>
          </div>
        </div>

        {records.length === 0 ? (
          <p className="muted small">No validation points recorded yet.</p>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Actual</th>
                  <th>Estimated</th>
                  <th>Error</th>
                  <th>% Error</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i}>
                    <td>{r.actualDistanceM.toFixed(2)} m</td>
                    <td>{r.estimatedDistanceM.toFixed(3)} m</td>
                    <td>{(r.absoluteErrorM * 100).toFixed(1)} cm</td>
                    <td>{r.percentageError.toFixed(2)}%</td>
                    <td>
                      <span className={`badge ${r.passFail === "PASS" ? "good" : "bad"}`}>{r.passFail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="muted small" style={{ marginTop: 12 }}>
              Results above are actual measured values from this browser session — nothing here is fabricated or
              hard-coded. If the ±3cm target is not met, that is a valid (and expected, at longer distances)
              research finding.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <div className="flex-between">
          <h3>5. Temporal Distance Estimation &amp; EMA Smoothing</h3>
          <div className="btn-row">
            <button
              className={`btn btn-sm ${chartMode === "recorded" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setChartMode("recorded")}
            >
              Latest Recorded Run
            </button>
            <button
              className={`btn btn-sm ${chartMode === "benchmark" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setChartMode("benchmark")}
            >
              Benchmark Pipeline Dataset (α=0.2)
            </button>
          </div>
        </div>

        <p className="muted small">
          Demonstrates how per-frame webcam IPD distance noise (raw distance $D_t$) is filtered by outlier rejection and
          Exponential Moving Average ($D_t^{"{EMA}"} = \alpha D_t + (1-\alpha) D_{"{t-1}"}^{"{EMA}"}$, $\alpha = {CONFIG.defaultSmoothingAlpha}$).
        </p>

        {chartMode === "recorded" ? (
          latestRecord?.temporalSamples && latestRecord.temporalSamples.length > 0 ? (
            <DistanceSmoothingChart
              samples={latestRecord.temporalSamples}
              title="Temporal Distance Estimation and EMA Smoothing (Recorded Webcam)"
              referenceDistanceM={latestRecord.actualDistanceM}
            />
          ) : (
            <div style={{ marginTop: 16, padding: 16, background: "var(--surface-alt)", borderRadius: 8 }}>
              <p className="muted small" style={{ margin: 0 }}>
                No recorded temporal frames found for the latest validation point. Click <strong>"Record 3s of Measurements"</strong> above with webcam active, or switch to <strong>"Benchmark Pipeline Dataset"</strong> to generate figure <code>distance_smoothing.png</code> instantly.
              </p>
            </div>
          )
        ) : (
          <DistanceSmoothingChart
            samples={generateDemoTemporalSeries(actualDistanceInput, 3.0, 30, CONFIG.defaultSmoothingAlpha)}
            title="Temporal Distance Estimation and EMA Smoothing"
            referenceDistanceM={actualDistanceInput}
          />
        )}
      </div>
    </div>
  );
}

