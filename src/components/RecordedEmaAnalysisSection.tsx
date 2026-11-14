import { useMemo, useState } from "react";
import type { ValidationRecord } from "../utils/storage";
import {
  classifyNewUserEmaRecording,
  calculatePilotEmaStabilityClassification,
  calculateRealRecordingMetrics,
  isEligibleRecordedEmaRecording,
  normalizeValidationParticipantId,
} from "../vision/realValidation";
import type { RealRecordingMetrics } from "../vision/realValidation";
import DistanceSmoothingChart from "./DistanceSmoothingChart";

interface RecordedEmaAnalysisSectionProps {
  records: ValidationRecord[];
  newUserResultSessionId: string | null;
}

function formatBand(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

export default function RecordedEmaAnalysisSection({
  records,
  newUserResultSessionId,
}: RecordedEmaAnalysisSectionProps) {
  const eligibleRecords = useMemo(
    () => records.filter(isEligibleRecordedEmaRecording),
    [records]
  );
  const recordingMetrics = useMemo(
    () =>
      eligibleRecords.map((record) => ({
        record,
        metrics: calculateRealRecordingMetrics(record.temporalSamples ?? [], record.actualDistanceM),
      })),
    [eligibleRecords]
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const selected =
    recordingMetrics.find(({ record }) => record.sessionId === selectedSessionId) ??
    recordingMetrics[recordingMetrics.length - 1] ??
    null;

  const pilotStability = useMemo(() => calculatePilotEmaStabilityClassification(records), [records]);
  const participantRows = pilotStability.participantSummaries;
  const newUserRecord = records.find((record) => record.sessionId === newUserResultSessionId) ?? null;
  const newUserResult = classifyNewUserEmaRecording(newUserRecord, pilotStability);
  const selectedMetrics: RealRecordingMetrics | null = selected?.metrics ?? null;
  const selectedParticipant = normalizeValidationParticipantId(selected?.record.participantId);

  return (
    <section className="card" aria-labelledby="recorded-ema-title">
      <div className="flex-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 id="recorded-ema-title" style={{ margin: 0 }}>Recorded EMA stability and proposal bands</h3>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Three-second raw-versus-EMA analysis from saved webcam recordings only.
          </p>
        </div>
        <span className={`badge ${eligibleRecords.length ? "good" : "neutral"}`}>
          {eligibleRecords.length ? "REAL HUMAN DATA — RECORDED" : "REAL DATA — AWAITING RECORDINGS"}
        </span>
      </div>

      {eligibleRecords.length === 0 ? (
        <p className="muted small" style={{ marginTop: 16 }}>
          No eligible temporal recordings are available for EMA analysis yet. This section will not create sample data.
        </p>
      ) : (
        <>
          <div className="field" style={{ maxWidth: 540, marginTop: 16 }}>
            <label htmlFor="ema-recording-select">Recorded session to display</label>
            <select
              id="ema-recording-select"
              value={selected?.record.sessionId ?? ""}
              onChange={(event) => setSelectedSessionId(event.target.value)}
            >
              {recordingMetrics.map(({ record }) => (
                <option key={record.sessionId} value={record.sessionId}>
                  {normalizeValidationParticipantId(record.participantId) ?? "Additional recording"} · {record.actualDistanceM.toFixed(3)} m reference · {record.sampleCount ?? record.temporalSamples?.length ?? 0} samples · {new Date(record.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {selected && selectedMetrics && (
            <>
              <div className="card-grid">
                <div className="stat-card"><div className="stat-label">Participant</div><div className="stat-value">{selectedParticipant ?? "Additional recording"}</div></div>
                <div className="stat-card"><div className="stat-label">Physical reference</div><div className="stat-value">{selected.record.actualDistanceM.toFixed(3)} m</div></div>
                <div className="stat-card"><div className="stat-label">Raw / EMA mean distance</div><div className="stat-value">{selectedMetrics.meanRawDistanceM.toFixed(3)} / {selectedMetrics.meanEmaDistanceM.toFixed(3)} m</div></div>
                <div className="stat-card"><div className="stat-label">Raw / EMA sample SD</div><div className="stat-value">{(selectedMetrics.rawSdM * 100).toFixed(2)} / {(selectedMetrics.emaSdM * 100).toFixed(2)} cm</div></div>
                <div className="stat-card"><div className="stat-label">Noise reduction</div><div className="stat-value">{selectedMetrics.noiseReductionPct === null ? "N/A (zero raw SD)" : `${selectedMetrics.noiseReductionPct.toFixed(2)}%`}</div></div>
                <div className="stat-card"><div className="stat-label">Raw / EMA frame MAE</div><div className="stat-value">{(selectedMetrics.meanRawAbsoluteErrorM * 100).toFixed(2)} / {(selectedMetrics.meanEmaAbsoluteErrorM * 100).toFixed(2)} cm</div></div>
                <div className="stat-card"><div className="stat-label">EMA mean-distance absolute error</div><div className="stat-value">{(Math.abs(selectedMetrics.meanEmaDistanceM - selected.record.actualDistanceM) * 100).toFixed(2)} cm</div></div>
                <div className="stat-card"><div className="stat-label">Sample count / duration</div><div className="stat-value">{selectedMetrics.validSampleCount} / {(selected.record.durationSec ?? 0).toFixed(2)} s</div></div>
                <div className="stat-card"><div className="stat-label">EMA alpha</div><div className="stat-value">{selected.record.emaAlpha?.toFixed(2) ?? "—"}</div></div>
              </div>
              <p className="muted small">
                Sample SD uses Bessel&apos;s correction (N−1). Negative noise reduction indicates that EMA variability exceeded raw variability.
              </p>
              <DistanceSmoothingChart
                samples={selected.record.temporalSamples ?? []}
                title={`${selectedParticipant ?? "Additional recording"} — raw and EMA distance over time`}
                referenceDistanceM={selected.record.actualDistanceM}
                alpha={selected.record.emaAlpha}
              />
            </>
          )}
        </>
      )}

      <div className="card" style={{ marginTop: 22, background: "var(--surface-alt)" }}>
        <h4 id="participant-results" style={{ margin: "0 0 8px" }}>Pilot-Based EMA Stability Classification</h4>
        <p className="muted small">
          EMA stability describes how much the smoothed distance trace fluctuates around its mean in eligible real recordings. This is a descriptive pilot summary for PO1–PO13 and is not a clinical threshold or a universal acceptance rule.
        </p>

        <div className="card-grid" style={{ marginTop: 12 }}>
          <div className="stat-card"><div className="stat-label">Eligible participants included</div><div className="stat-value">{pilotStability.includedParticipantCount} / {pilotStability.totalIntendedParticipants}</div></div>
          <div className="stat-card"><div className="stat-label">Q1 participant EMA SD</div><div className="stat-value">{formatBand(pilotStability.q1Cm)} cm</div></div>
          <div className="stat-card"><div className="stat-label">Median participant EMA SD</div><div className="stat-value">{formatBand(pilotStability.medianCm)} cm</div></div>
          <div className="stat-card"><div className="stat-label">Q3 participant EMA SD</div><div className="stat-value">{formatBand(pilotStability.q3Cm)} cm</div></div>
        </div>

        {pilotStability.hasSufficientData ? (
          <p className="muted small" style={{ marginTop: 12 }}>
            Quartiles are calculated from one participant-level EMA SD value per participant (the mean of that participant&apos;s eligible recording-level EMA SD values). Low variability is below Q1, medium is between Q1 and Q3 inclusive, and high is above Q3. Values exactly equal to Q1 or Q3 are classified as medium.
          </p>
        ) : (
          <p className="muted small" style={{ marginTop: 12 }}>
            Insufficient eligible participant-level data is available for a cohort quartile distribution yet. Missing or ineligible participant records remain unavailable instead of being treated as zero or low variability.
          </p>
        )}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Participant ID</th>
                <th>Eligible recordings</th>
                <th>Participant-level EMA SD (cm)</th>
                <th>Variability classification</th>
                <th>Accuracy / error (cm)</th>
                <th>Noise reduction (%)</th>
                <th>Data availability</th>
              </tr>
            </thead>
            <tbody>
              {participantRows.map((participant) => {
                const classificationClass = participant.variabilityClassification === "Low variability"
                  ? "good"
                  : participant.variabilityClassification === "Medium variability"
                    ? "neutral"
                    : participant.variabilityClassification === "High variability"
                      ? "bad"
                      : "neutral";
                return (
                  <tr key={participant.participantId}>
                    <td>{participant.participantId}</td>
                    <td>{participant.eligibleRecordingCount || "—"}</td>
                    <td>{participant.participantEmaSdCm === null ? "—" : formatBand(participant.participantEmaSdCm)}</td>
                    <td>
                      {participant.variabilityClassification ? (
                        <span className={`badge ${classificationClass}`}>{participant.variabilityClassification}</span>
                      ) : (
                        "Unavailable"
                      )}
                    </td>
                    <td>{participant.meanDistanceAbsoluteErrorCm === null ? "—" : `${formatBand(participant.meanDistanceAbsoluteErrorCm)} cm`}</td>
                    <td>{participant.noiseReductionPct === null ? "N/A" : `${participant.noiseReductionPct.toFixed(2)}%`}</td>
                    <td>{participant.dataStatus}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section aria-labelledby="new-user-ema-title" style={{ marginTop: 20 }}>
          <h5 id="new-user-ema-title" style={{ margin: "0 0 8px" }}>New-user EMA result</h5>
          {!newUserResultSessionId ? (
            <p className="muted small">
              Complete a valid three-second recording above to compare its EMA variability with the eligible pilot cohort.
            </p>
          ) : newUserResult === null ? (
            <p className="muted small" role="status" aria-live="polite">
              No category assigned. This saved attempt is invalid for EMA analysis or has fewer than two valid samples.
            </p>
          ) : (
            <div className="card" role="status" aria-live="polite">
              <p className="small">
                Your EMA standard deviation: <strong>{formatBand(newUserResult.emaSdCm)} cm</strong>
              </p>
              {newUserResult.classification === null ? (
                <>
                  <p className="small">
                    Classification unavailable until at least two pilot participants have eligible recordings.
                  </p>
                  <p className="small">
                    Lower threshold (Q1): — cm; upper threshold (Q3): — cm.
                  </p>
                </>
              ) : (
                <>
                  <p className="small">
                    Category: <strong>{newUserResult.classification}</strong>
                  </p>
                  <p className="small">
                    Lower threshold (Q1): {formatBand(newUserResult.q1Cm)} cm; upper threshold (Q3): {formatBand(newUserResult.q3Cm)} cm.
                  </p>
                  <p className="small" style={{ marginBottom: 0 }}>
                    {newUserResult.classification === "Low variability"
                      ? "Your EMA variability is classified as Low because your EMA standard deviation is below the lower threshold derived from the pilot participants."
                      : newUserResult.classification === "Medium variability"
                        ? "Your EMA variability is classified as Medium because your EMA standard deviation falls between the lower and upper thresholds derived from the pilot participants, including the boundaries."
                        : "Your EMA variability is classified as High because your EMA standard deviation is above the upper threshold derived from the pilot participants."}
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        <p className="muted small" style={{ marginTop: 12 }}>
          These thresholds are exploratory and derived from a small pilot cohort. They are not clinically validated or universal performance limits. The categories describe comparison with the observed pilot variability only; they do not diagnose eyesight, identify a cause, or demonstrate measurement accuracy. Accuracy remains a separate measure.
        </p>
      </div>
    </section>
  );
}
