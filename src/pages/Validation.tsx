import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVision } from "../context/VisionContext";
import CameraPreview from "../components/CameraPreview";
import { absoluteError, mean, percentageError, rootMeanSquareError, maxAbsoluteError } from "../utils/math";
import { CONFIG } from "../config";
import { getValidationRecords, saveValidationRecord, type ValidationRecord } from "../utils/storage";
import { downloadCSV, downloadJSON } from "../utils/csvExport";
import type { TemporalDistanceSample } from "../vision/distanceSmoothing";
import { getAdditionalDistanceRecords, normalizeValidationParticipantId } from "../vision/realValidation";
import RecordedEmaAnalysisSection from "../components/RecordedEmaAnalysisSection";

const SAMPLE_DURATION_MS = 3000;

function isDistanceValidationRecord(record: ValidationRecord): boolean {
  return (
    record.dataSource === "RECORDED" &&
    (record.recordingStatus === undefined || record.recordingStatus === "VALID") &&
    Number.isFinite(record.estimatedDistanceM) &&
    Number.isFinite(record.absoluteErrorM) &&
    Number.isFinite(record.percentageError)
  );
}

export default function Validation() {
  const { cameraStatus, startCamera, tracking, modelError, smoothingAlpha } = useVision();
  const [referenceDistanceInput, setReferenceDistanceInput] = useState("");
  const [sampling, setSampling] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [records, setRecords] = useState<ValidationRecord[]>([]);
  const [newUserResultSessionId, setNewUserResultSessionId] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState("");
  const [samplingError, setSamplingError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [failedSamples, setFailedSamples] = useState(0);
  const [recordedSamples, setRecordedSamples] = useState(0);
  const autoStartRequestedRef = useRef(false);
  const samplesRef = useRef<TemporalDistanceSample[]>([]);
  const samplingStartMsRef = useRef(0);
  const lastObservedAtMsRef = useRef<number | null>(null);
  const failedSamplesRef = useRef(0);
  const samplingRef = useRef(false);

  const referenceDistanceM = Number(referenceDistanceInput);
  const validReferenceDistance =
    referenceDistanceInput.trim() !== "" && Number.isFinite(referenceDistanceM) && referenceDistanceM > 0;
  const recordedRecords = useMemo(() => records.filter((record) => record.dataSource === "RECORDED"), [records]);
  const validRecords = useMemo(() => recordedRecords.filter(isDistanceValidationRecord), [recordedRecords]);
  const additionalRecords = useMemo(
    () => getAdditionalDistanceRecords(validRecords),
    [validRecords]
  );
  const participantIdReviewRecords = validRecords.filter(
    (record) => Boolean(record.participantId?.trim()) && normalizeValidationParticipantId(record.participantId) === null
  );
  const excludedRecords = recordedRecords.filter((record) => !isDistanceValidationRecord(record));
  const estimates = additionalRecords
    .filter((record) => Number.isFinite(record.estimatedDistanceM))
    .map((record) => record.estimatedDistanceM);
  const references = additionalRecords
    .filter((record) => Number.isFinite(record.estimatedDistanceM))
    .map((record) => record.actualDistanceM);
  const errors = estimates.map((estimate, index) => absoluteError(estimate, references[index]));
  const mae = errors.length ? mean(errors) : null;
  const rmse = errors.length ? rootMeanSquareError(estimates, references) : null;
  const maxError = errors.length ? maxAbsoluteError(estimates, references) : null;
  const withinToleranceCount = additionalRecords.filter(
    (record) =>
      Number.isFinite(record.absoluteErrorM) &&
      record.absoluteErrorM <= CONFIG.targetDistanceToleranceM
  ).length;
  const liveRawDistance = tracking.rawDistanceM;
  const liveEmaDistance = tracking.smoothedDistanceM;

  const refreshRecords = useCallback(async () => {
    try {
      setRecords(await getValidationRecords());
      setRecordsError("");
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : "Could not load saved distance validation records.");
    }
  }, []);

  const finishSampling = useCallback(
    async (reason: "COMPLETED" | "TRACKING_LOST" | "CANCELLED") => {
      if (!samplingRef.current) return;
      samplingRef.current = false;
      setSampling(false);
      setCountdownSec(0);

      const samples = [...samplesRef.current];
      const failureCount = failedSamplesRef.current;
      const valid = reason === "COMPLETED" && samples.length >= 2;
      const recordingStatus = valid
        ? "VALID"
        : reason === "TRACKING_LOST"
          ? "TRACKING_LOST"
          : reason === "CANCELLED"
            ? "CANCELLED"
            : "INSUFFICIENT_SAMPLES";
      const estimatesForRun = samples.map((sample) => sample.smoothedDistanceM);
      const estimatedDistanceM = estimatesForRun.length ? mean(estimatesForRun) : Number.NaN;
      const absoluteErrorM = valid ? absoluteError(estimatedDistanceM, referenceDistanceM) : Number.NaN;
      const pctError = valid ? percentageError(estimatedDistanceM, referenceDistanceM) : Number.NaN;
      const endTime = samples.length > 0 ? samples[samples.length - 1].timeSec : 0;
      const durationSec = endTime;

      const record: ValidationRecord = {
        sessionId: crypto.randomUUID(),
        timestamp: new Date(samplingStartMsRef.current + performance.timeOrigin).toISOString(),
        actualDistanceM: referenceDistanceM,
        estimatedDistanceM,
        absoluteErrorM,
        percentageError: pctError,
        ipdPixels: Number.NaN,
        headYawDeg: Number.NaN,
        headPitchDeg: Number.NaN,
        confidence: Number.NaN,
        targetOptotypeMM: Number.NaN,
        renderedOptotypePX: Number.NaN,
        measuredOptotypeMM: null,
        passFail: valid && absoluteErrorM <= CONFIG.targetDistanceToleranceM ? "PASS" : "FAIL",
        temporalSamples: samples,
        dataSource: "RECORDED",
        emaAlpha: smoothingAlpha,
        cameraStatus,
        durationSec,
        effectiveFps: durationSec > 0 ? (samples.length - 1) / durationSec : 0,
        sampleCount: samples.length,
        droppedSamplesCount: failureCount,
        meanRawDistanceM: samples.length ? mean(samples.map((sample) => sample.rawDistanceM)) : undefined,
        trackingFailures: failureCount,
        recordingStatus,
      };

      try {
        await saveValidationRecord(record);
        setNewUserResultSessionId(record.sessionId);
        await refreshRecords();
        setStatusMessage(
          valid
            ? `Saved ${samples.length} tracked samples.`
            : `Saved attempt as ${recordingStatus.replaceAll("_", " ")} (${samples.length} valid samples, ${failureCount} tracking failures).`
        );
      } catch (error) {
        setSamplingError(error instanceof Error ? error.message : "Could not save the distance validation recording.");
      }
    },
    [cameraStatus, referenceDistanceM, refreshRecords, smoothingAlpha]
  );

  useEffect(() => {
    if (cameraStatus === "idle" && !autoStartRequestedRef.current) {
      autoStartRequestedRef.current = true;
      void startCamera();
    }
  }, [cameraStatus, startCamera]);

  useEffect(() => {
    let mounted = true;
    void getValidationRecords()
      .then((savedRecords) => {
        if (!mounted) return;
        setRecords(savedRecords);
        setRecordsError("");
      })
      .catch((error: unknown) => {
        if (mounted) {
          setRecordsError(error instanceof Error ? error.message : "Could not load saved distance validation records.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sampling) return;
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - samplingStartMsRef.current;
      const remaining = Math.max(0, (SAMPLE_DURATION_MS - elapsed) / 1000);
      setCountdownSec(remaining);
      if (remaining <= 0) void finishSampling("COMPLETED");
    }, 100);
    return () => window.clearInterval(timer);
  }, [finishSampling, sampling]);

  useEffect(() => {
    if (!samplingRef.current || tracking.observedAtMs === null) return;
    if (tracking.observedAtMs === lastObservedAtMsRef.current) return;
    lastObservedAtMsRef.current = tracking.observedAtMs;

    if (
      cameraStatus !== "streaming" ||
      tracking.rawDistanceM === null ||
      tracking.smoothedDistanceM === null ||
      !Number.isFinite(tracking.rawDistanceM) ||
      !Number.isFinite(tracking.smoothedDistanceM) ||
      tracking.rawDistanceM <= 0 ||
      tracking.smoothedDistanceM <= 0
    ) {
      failedSamplesRef.current += 1;
      setFailedSamples(failedSamplesRef.current);
      void finishSampling("TRACKING_LOST");
      return;
    }

    const timeSec = (tracking.observedAtMs - samplingStartMsRef.current) / 1000;
    if (timeSec < 0 || timeSec > SAMPLE_DURATION_MS / 1000) return;
    samplesRef.current.push({
      timeSec,
      timestamp: new Date(performance.timeOrigin + tracking.observedAtMs).toISOString(),
      rawDistanceM: tracking.rawDistanceM,
      smoothedDistanceM: tracking.smoothedDistanceM,
      referenceDistanceM,
      ipdPixels: tracking.eye?.ipdPixels,
      confidence: tracking.eye?.confidence,
      headYawDeg: tracking.headPose?.yawDeg,
      headPitchDeg: tracking.headPose?.pitchDeg,
    });
    setRecordedSamples(samplesRef.current.length);
  }, [cameraStatus, finishSampling, referenceDistanceM, tracking]);

  const startSampling = () => {
    setSamplingError("");
    setStatusMessage("");
    if (!validReferenceDistance) {
      setSamplingError("Enter the positive physical distance measured with a tape or laser meter.");
      return;
    }
    if (cameraStatus !== "streaming" || liveRawDistance === null || liveEmaDistance === null) {
      setSamplingError("Start the camera and wait for valid face tracking before recording.");
      return;
    }
    setNewUserResultSessionId(null);
    samplesRef.current = [];
    failedSamplesRef.current = 0;
    lastObservedAtMsRef.current = null;
    samplingStartMsRef.current = performance.now();
    samplingRef.current = true;
    setRecordedSamples(0);
    setFailedSamples(0);
    setCountdownSec(SAMPLE_DURATION_MS / 1000);
    setSampling(true);
  };

  const exportRows = additionalRecords.map((record, index) => ({
    measurement_id: `M${String(index + 1).padStart(2, "0")}`,
    data_source: "RECORDED",
    session_id: record.sessionId,
    timestamp: record.timestamp,
    physical_reference_distance_m: record.actualDistanceM,
    mean_ema_estimated_distance_m: record.estimatedDistanceM,
    absolute_error_cm: record.absoluteErrorM * 100,
    percentage_error: record.percentageError,
    valid_samples: record.sampleCount ?? record.temporalSamples?.length ?? 0,
    duration_sec: record.durationSec,
    status: record.passFail,
  }));
  const getExcludedReason = (record: ValidationRecord): string => {
    if (record.recordingStatus && record.recordingStatus !== "VALID") {
      return record.recordingStatus.replaceAll("_", " ");
    }
    if (!Number.isFinite(record.actualDistanceM) || record.actualDistanceM <= 0) {
      return "Missing or invalid physical reference distance";
    }
    if (!Number.isFinite(record.estimatedDistanceM)) return "Missing or invalid EMA estimate";
    if (!Number.isFinite(record.absoluteErrorM)) return "Missing or invalid absolute error";
    if (!Number.isFinite(record.percentageError)) return "Missing or invalid percentage error";
    return "Does not meet distance-summary eligibility";
  };

  return (
    <div className="page wide">
      <div className="section-heading">
        <h2>Distance Validation</h2>
      </div>
      <p className="muted">
        Enter a physical reference distance, then compare it with the webcam-estimated distance. Results below contain recorded measurements only.
      </p>

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
          <button className="btn btn-primary" onClick={() => void startCamera()} disabled={cameraStatus === "requesting"}>
            {cameraStatus === "requesting" ? "Starting Camera…" : "Start Camera"}
          </button>
        </>
      )}

      {cameraStatus === "streaming" && (
        <div className="card-grid" style={{ alignItems: "start" }}>
          <div className="card"><CameraPreview /></div>
          <div className="card">
            <h3>Record a distance validation</h3>
            <div className="field">
              <label htmlFor="physical-reference-distance">Physical reference distance (m)</label>
              <input
                id="physical-reference-distance"
                type="number"
                min="0"
                step="any"
                value={referenceDistanceInput}
                onChange={(event) => setReferenceDistanceInput(event.target.value)}
                disabled={sampling}
                aria-invalid={referenceDistanceInput !== "" && !validReferenceDistance}
              />
              <span className="muted small">Measure the camera-to-face distance physically. This value is not replaced with the webcam estimate.</span>
            </div>
            <div className="card-grid">
              <div className="stat-card"><div className="stat-label">Current raw distance</div><div className="stat-value">{liveRawDistance !== null ? `${liveRawDistance.toFixed(3)} m` : "—"}</div></div>
              <div className="stat-card"><div className="stat-label">Current EMA distance</div><div className="stat-value">{liveEmaDistance !== null ? `${liveEmaDistance.toFixed(3)} m` : "—"}</div></div>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              {!sampling ? (
                <button className="btn btn-primary" onClick={startSampling} disabled={!validReferenceDistance || liveRawDistance === null || liveEmaDistance === null}>
                  Record 3 seconds
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => void finishSampling("CANCELLED")}>
                  Stop recording
                </button>
              )}
              {sampling && <span className="badge bad" role="status" aria-live="polite">RECORDING · {countdownSec.toFixed(1)} s · {recordedSamples} samples · {failedSamples} tracking failures</span>}
            </div>
            {samplingError && <p className="badge bad" role="alert">{samplingError}</p>}
            {statusMessage && <p className="badge neutral" role="status">{statusMessage}</p>}
          </div>
        </div>
      )}

      {recordsError && <p className="badge bad" role="alert">{recordsError}</p>}
      <section className="card" aria-labelledby="distance-summary-title">
        <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 id="distance-summary-title" style={{ margin: 0 }}>Recorded distance results — additional recordings</h3>
            <p className="muted small" style={{ marginBottom: 0 }}>
              This table and its downloads include only real recordings without a participant ID. PO1–PO13 results are shown separately below; other saved participant IDs are held for review.
            </p>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              disabled={additionalRecords.length === 0}
              onClick={() => downloadCSV("distance-validation.csv", exportRows, undefined, {
                "Data Source": "RECORDED",
                "Export Timestamp": new Date().toISOString(),
                "Aggregation": "One row per valid additional 3-second recording without a participant ID; error is based on the mean EMA estimate",
              })}
            >
              Download CSV
            </button>
            <button
              className="btn btn-secondary"
              disabled={additionalRecords.length === 0}
              onClick={() => downloadJSON("distance-validation.json", additionalRecords, {
                dataSource: "RECORDED",
                exportTimestamp: new Date().toISOString(),
                measurementCount: additionalRecords.length,
                assignmentScope: "Additional recordings without a participant ID",
              })}
            >
              Download JSON
            </button>
          </div>
        </div>

        {additionalRecords.length === 0 ? (
          <p className="muted small" style={{ marginTop: 16 }}>
            No additional distance recordings are available. Recordings linked to PO1–PO13 are reported in the separate participant table below.
          </p>
        ) : (
          <>
            <div className="card-grid" style={{ marginTop: 16 }}>
              <div className="stat-card"><div className="stat-label">Additional recordings</div><div className="stat-value">{additionalRecords.length}</div></div>
              <div className="stat-card"><div className="stat-label">MAE</div><div className="stat-value">{mae === null ? "—" : `${(mae * 100).toFixed(2)} cm`}</div></div>
              <div className="stat-card"><div className="stat-label">RMSE</div><div className="stat-value">{rmse === null ? "—" : `${(rmse * 100).toFixed(2)} cm`}</div></div>
              <div className="stat-card"><div className="stat-label">Maximum error</div><div className="stat-value">{maxError === null ? "—" : `${(maxError * 100).toFixed(2)} cm`}</div></div>
              <div className="stat-card"><div className="stat-label">Within ±3 cm target</div><div className="stat-value">{withinToleranceCount} / {additionalRecords.length}</div></div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr><th>Timestamp</th><th>Physical reference</th><th>Mean EMA estimate</th><th>Absolute error</th><th>% error</th><th>Samples</th><th>Duration</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {additionalRecords.map((record) => (
                    <tr key={record.sessionId}>
                      <td>{new Date(record.timestamp).toLocaleString()}</td>
                      <td>{record.actualDistanceM.toFixed(3)} m</td>
                      <td>{record.estimatedDistanceM.toFixed(3)} m</td>
                      <td>{(record.absoluteErrorM * 100).toFixed(2)} cm</td>
                      <td>{record.percentageError.toFixed(2)}%</td>
                      <td>{record.sampleCount ?? record.temporalSamples?.length ?? 0}</td>
                      <td>{record.durationSec?.toFixed(2) ?? "—"} s</td>
                      <td><span className={`badge ${record.passFail === "PASS" ? "good" : "bad"}`}>{record.passFail}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {participantIdReviewRecords.length > 0 && (
        <section className="card" aria-labelledby="participant-review-title">
          <h3 id="participant-review-title">Saved recordings requiring participant-ID review</h3>
          <p className="muted small">
            These recorded rows have a participant ID that does not match PO1–PO13 or the supported legacy P01–P13 format. They are retained, excluded from cohort calculations, and excluded from additional-record exports.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Participant ID as saved</th><th>Timestamp</th><th>Physical reference</th><th>EMA estimate</th><th>Source</th></tr></thead>
              <tbody>{participantIdReviewRecords.map((record) => (
                <tr key={record.sessionId}>
                  <td>{record.participantId}</td>
                  <td>{new Date(record.timestamp).toLocaleString()}</td>
                  <td>{record.actualDistanceM.toFixed(3)} m</td>
                  <td>{record.estimatedDistanceM.toFixed(3)} m</td>
                  <td>{record.dataSource}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {excludedRecords.length > 0 && (
        <section className="card" aria-labelledby="excluded-records-title">
          <h3 id="excluded-records-title">Saved recordings excluded from distance calculations</h3>
          <p className="muted small">
            {excludedRecords.length} recorded attempt(s) are retained in IndexedDB but excluded from the valid distance summary and its exports.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Participant</th><th>Timestamp</th><th>Physical reference</th><th>Valid samples</th><th>Status / exclusion reason</th></tr></thead>
              <tbody>{excludedRecords.map((record) => (
                <tr key={record.sessionId}>
                  <td>{normalizeValidationParticipantId(record.participantId) ?? record.participantId ?? "Additional recording"}</td>
                  <td>{new Date(record.timestamp).toLocaleString()}</td>
                  <td>{Number.isFinite(record.actualDistanceM) ? `${record.actualDistanceM.toFixed(3)} m` : "—"}</td>
                  <td>{record.temporalSamples?.filter((sample) =>
                    Number.isFinite(sample.timeSec) &&
                    sample.timeSec >= 0 &&
                    Number.isFinite(sample.rawDistanceM) &&
                    sample.rawDistanceM > 0 &&
                    Number.isFinite(sample.smoothedDistanceM) &&
                    sample.smoothedDistanceM > 0
                  ).length ?? 0}</td>
                  <td>{getExcludedReason(record)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <RecordedEmaAnalysisSection
        records={recordedRecords}
        newUserResultSessionId={newUserResultSessionId}
      />
    </div>
  );
}
