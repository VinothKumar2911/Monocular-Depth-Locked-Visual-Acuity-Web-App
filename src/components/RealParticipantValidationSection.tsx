import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadCameraCalibration } from "../calibration/calibrationStorage";
import { CONFIG } from "../config";
import { useVision } from "../context/VisionContext";
import { downloadCSV, downloadJSON } from "../utils/csvExport";
import { sampleStdDev } from "../utils/math";
import { getValidationRecords, saveValidationRecord, type ValidationRecord } from "../utils/storage";
import {
  calculateRealRecordingMetrics,
  DEFAULT_VALIDATION_PROTOCOL,
  getRecordingDurationSec,
  getStudyCompletion,
  getValidExperimentalRecords,
  isDuplicateValidRecording,
  isValidParticipantId,
  isValidReferenceDistance,
  normalizeValidationParticipantId,
  parseProtocolDistances,
  VALIDATION_PARTICIPANT_IDS,
} from "../vision/realValidation";
import type { TemporalDistanceSample } from "../vision/distanceSmoothing";
import DistanceSmoothingChart from "./DistanceSmoothingChart";

type ReferenceUnit = "m" | "cm" | "ft" | "in";
type FinishReason = "COMPLETED" | "TRACKING_LOST" | "CANCELLED";

interface RecordingInProgress {
  sessionId: string;
  participantId: string;
  repetition: number;
  protocolDistanceM: number;
  referenceDistanceM: number;
  referenceDistanceUnit: ReferenceUnit;
  durationSec: number;
  emaAlpha: number;
  cameraStatus: string;
  startedAtMs: number;
  startedAtIso: string;
  samples: TemporalDistanceSample[];
  trackingFailures: number;
  lastObservedAtMs: number | null;
  measuredOptotypeMM: number | null;
}

interface RealParticipantValidationSectionProps {
  records: ValidationRecord[];
  onRecordsChanged: (records: ValidationRecord[]) => void;
}

function unitToMeters(value: number, unit: ReferenceUnit): number {
  const conversion: Record<ReferenceUnit, number> = { m: 1, cm: 0.01, ft: 0.3048, in: 0.0254 };
  return value * conversion[unit];
}

function formatMeters(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) ? `${value.toFixed(3)} m` : "—";
}

function meanOrNull(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatParticipantMeanSd(values: number[], suffix: string): string {
  const average = meanOrNull(values);
  if (average === null) return "—";
  const betweenParticipantSd = values.length > 1 ? sampleStdDev(values) : null;
  return `${average.toFixed(2)} ± ${betweenParticipantSd === null ? "N/A" : betweenParticipantSd.toFixed(2)} ${suffix}`;
}

export default function RealParticipantValidationSection({
  records,
  onRecordsChanged,
}: RealParticipantValidationSectionProps) {
  const { cameraStatus, tracking, smoothingAlpha } = useVision();
  const cameraCalibration = loadCameraCalibration();
  const [participantId, setParticipantId] = useState("");
  const [protocolDistanceInput, setProtocolDistanceInput] = useState("");
  const [referenceDistanceInput, setReferenceDistanceInput] = useState("");
  const [referenceUnit, setReferenceUnit] = useState<ReferenceUnit>("m");
  const [repetitionInput, setRepetitionInput] = useState("1");
  const [protocolDistancesInput, setProtocolDistancesInput] = useState(
    DEFAULT_VALIDATION_PROTOCOL.referenceDistancesM.join(", ")
  );
  const [repetitionsInput, setRepetitionsInput] = useState(
    String(DEFAULT_VALIDATION_PROTOCOL.repetitionsPerDistance)
  );
  const [durationInput, setDurationInput] = useState(String(DEFAULT_VALIDATION_PROTOCOL.durationSec));
  const [measuredOptotypeInput, setMeasuredOptotypeInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [recordedSampleCount, setRecordedSampleCount] = useState(0);
  const [trackingFailures, setTrackingFailures] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const activeRecordingRef = useRef<RecordingInProgress | null>(null);

  const referenceDistanceM = unitToMeters(Number(referenceDistanceInput), referenceUnit);
  const protocolDistanceM = Number(protocolDistanceInput);
  const protocolDistancesM = useMemo(
    () => parseProtocolDistances(protocolDistancesInput),
    [protocolDistancesInput]
  );
  const repetitionsPerDistance = Number(repetitionsInput);
  const durationSec = Number(durationInput);
  const measuredOptotype = measuredOptotypeInput.trim() ? Number(measuredOptotypeInput) : null;
  const measuredOptotypeValid =
    measuredOptotype === null || (Number.isFinite(measuredOptotype) && measuredOptotype > 0);
  const validRecords = useMemo(() => getValidExperimentalRecords(records), [records]);
  const participantRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          record.dataSource === "RECORDED" &&
          normalizeValidationParticipantId(record.participantId) !== null
      ),
    [records]
  );
  const completion = useMemo(
    () =>
      getStudyCompletion(
        records,
        protocolDistancesM ?? [],
        Number.isInteger(repetitionsPerDistance) && repetitionsPerDistance > 0 ? repetitionsPerDistance : 0
      ),
    [records, protocolDistancesM, repetitionsPerDistance]
  );
  const currentRawM = tracking.rawDistanceM;
  const currentEmaM = tracking.smoothedDistanceM;
  const trackingReady =
    cameraStatus === "streaming" &&
    Boolean(cameraCalibration) &&
    tracking.eye !== null &&
    currentRawM !== null &&
    currentEmaM !== null &&
    Number.isFinite(currentRawM) &&
    Number.isFinite(currentEmaM);
  const protocolValid =
    protocolDistancesM !== null &&
    Number.isInteger(repetitionsPerDistance) &&
    repetitionsPerDistance >= 1 &&
    repetitionsPerDistance <= 20 &&
    Number.isFinite(durationSec) &&
    durationSec >= 1 &&
    durationSec <= 30;
  const referenceIsValid = isValidReferenceDistance(referenceDistanceM);
  const duplicateExists =
    participantId !== "" &&
    Number.isFinite(protocolDistanceM) &&
    Number.isInteger(Number(repetitionInput)) &&
    isDuplicateValidRecording(records, participantId, Number(repetitionInput), protocolDistanceM);

  const refreshRecords = useCallback(async () => {
    const latest = await getValidationRecords();
    onRecordsChanged(latest);
  }, [onRecordsChanged]);

  const finishRecording = useCallback(
    async (reason: FinishReason) => {
      const active = activeRecordingRef.current;
      if (!active) return;
      activeRecordingRef.current = null;
      setIsRecording(false);
      setCountdownSec(0);
      setTrackingFailures(active.trackingFailures);

      const sampleCount = active.samples.length;
      const status =
        reason === "COMPLETED" && sampleCount >= 2
          ? "VALID"
          : reason === "TRACKING_LOST"
            ? "TRACKING_LOST"
            : reason === "CANCELLED"
              ? "CANCELLED"
              : "INSUFFICIENT_SAMPLES";
      let metrics: ReturnType<typeof calculateRealRecordingMetrics> | null = null;
      if (sampleCount >= 2) {
        metrics = calculateRealRecordingMetrics(active.samples, active.referenceDistanceM);
      }
      const recordedDurationSec = getRecordingDurationSec(active.samples);
      const averageSampleValue = (selectValue: (sample: TemporalDistanceSample) => number | undefined) => {
        const values = active.samples
          .map(selectValue)
          .filter((value): value is number => value !== undefined && Number.isFinite(value));
        return meanOrNull(values) ?? Number.NaN;
      };
      const targetOptotypeMM =
        2 * active.referenceDistanceM * 1000 * Math.tan((CONFIG.targetVisualAngleArcMin / 60) * Math.PI / 360);
      const record: ValidationRecord = {
        sessionId: active.sessionId,
        participantId: active.participantId,
        repetition: active.repetition,
        protocolDistanceM: active.protocolDistanceM,
        referenceDistanceUnit: active.referenceDistanceUnit,
        timestamp: active.startedAtIso,
        recordingTimestamp: active.startedAtIso,
        actualDistanceM: active.referenceDistanceM,
        estimatedDistanceM: metrics?.meanEmaDistanceM ?? Number.NaN,
        absoluteErrorM: metrics?.meanEmaAbsoluteErrorM ?? Number.NaN,
        percentageError: metrics?.meanEmaPercentageError ?? Number.NaN,
        ipdPixels: averageSampleValue((sample) => sample.ipdPixels),
        headYawDeg: averageSampleValue((sample) => sample.headYawDeg),
        headPitchDeg: averageSampleValue((sample) => sample.headPitchDeg),
        confidence: averageSampleValue((sample) => sample.confidence),
        targetOptotypeMM,
        renderedOptotypePX: Number.NaN,
        measuredOptotypeMM: active.measuredOptotypeMM,
        passFail:
          metrics && metrics.meanEmaAbsoluteErrorM <= CONFIG.targetDistanceToleranceM ? "PASS" : "FAIL",
        temporalSamples: active.samples,
        dataSource: "RECORDED",
        emaAlpha: active.emaAlpha,
        cameraStatus: active.cameraStatus,
        durationSec: recordedDurationSec,
        effectiveFps: recordedDurationSec > 0 ? (sampleCount - 1) / recordedDurationSec : 0,
        sampleCount,
        droppedSamplesCount: active.trackingFailures,
        rawSdM: metrics?.rawSdM,
        smoothedSdM: metrics?.emaSdM,
        rawSdCm: metrics ? metrics.rawSdM * 100 : undefined,
        smoothedSdCm: metrics ? metrics.emaSdM * 100 : undefined,
        noiseReductionPct: metrics?.noiseReductionPct,
        meanRawDistanceM: metrics?.meanRawDistanceM,
        meanRawErrorM: metrics?.meanRawErrorM,
        meanEmaErrorM: metrics?.meanEmaErrorM,
        rawAbsoluteErrorM: metrics?.meanRawAbsoluteErrorM,
        emaAbsoluteErrorM: metrics?.meanEmaAbsoluteErrorM,
        meanRawPercentageError: metrics?.meanRawPercentageError,
        meanEmaPercentageError: metrics?.meanEmaPercentageError,
        rawVarianceM2: metrics?.rawVarianceM2,
        smoothedVarianceM2: metrics?.emaVarianceM2,
        emaRmseM: metrics?.emaRmseM,
        maxRawAbsoluteErrorM: metrics?.maxRawAbsoluteErrorM,
        maxEmaAbsoluteErrorM: metrics?.maxEmaAbsoluteErrorM,
        maxAbsoluteErrorM: metrics?.maxEmaAbsoluteErrorM,
        trackingFailures: active.trackingFailures,
        recordingStatus: status,
      };

      try {
        await saveValidationRecord(record);
        if (status === "VALID") {
          setSelectedSessionId(active.sessionId);
          setStatusMessage(`Recording saved: ${active.participantId}, ${active.protocolDistanceM.toFixed(2)} m condition (physical reference ${active.referenceDistanceM.toFixed(3)} m), repetition ${active.repetition}.`);
        } else {
          setStatusMessage(`Attempt saved as ${status.replaceAll("_", " ")} (${sampleCount} valid samples, ${active.trackingFailures} tracking failures).`);
        }
        setMeasuredOptotypeInput("");
        try {
          await refreshRecords();
        } catch (error) {
          setErrorMessage(
            `Recording was saved, but the results list could not be refreshed: ${
              error instanceof Error ? error.message : "unknown storage error"
            }`
          );
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "The recording could not be saved.");
      }
    },
    [refreshRecords, setSelectedSessionId]
  );

  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => {
      const active = activeRecordingRef.current;
      if (!active) return;
      const elapsed = (performance.now() - active.startedAtMs) / 1000;
      const remaining = Math.max(0, active.durationSec - elapsed);
      setCountdownSec(remaining);
      if (remaining <= 0) void finishRecording("COMPLETED");
    }, 100);
    return () => window.clearInterval(interval);
  }, [finishRecording, isRecording]);

  useEffect(() => {
    const active = activeRecordingRef.current;
    if (!active) return;
    if (cameraStatus !== "streaming") {
      active.trackingFailures += 1;
      setTrackingFailures(active.trackingFailures);
      void finishRecording("TRACKING_LOST");
      return;
    }
    if (tracking.observedAtMs === null || tracking.observedAtMs <= active.startedAtMs) return;
    if (tracking.observedAtMs === active.lastObservedAtMs) return;
    active.lastObservedAtMs = tracking.observedAtMs;

    if (
      cameraStatus !== "streaming" ||
      tracking.eye === null ||
      tracking.rawDistanceM === null ||
      tracking.smoothedDistanceM === null ||
      !Number.isFinite(tracking.rawDistanceM) ||
      tracking.rawDistanceM <= 0 ||
      !Number.isFinite(tracking.smoothedDistanceM) ||
      tracking.smoothedDistanceM <= 0
    ) {
      active.trackingFailures += 1;
      setTrackingFailures(active.trackingFailures);
      void finishRecording("TRACKING_LOST");
      return;
    }

    const timeSec = (tracking.observedAtMs - active.startedAtMs) / 1000;
    if (timeSec > active.durationSec) return;
    active.samples.push({
      timeSec,
      timestamp: new Date(Date.parse(active.startedAtIso) + timeSec * 1000).toISOString(),
      rawDistanceM: tracking.rawDistanceM,
      smoothedDistanceM: tracking.smoothedDistanceM,
      referenceDistanceM: active.referenceDistanceM,
      ipdPixels: tracking.eye?.ipdPixels,
      confidence: tracking.eye?.confidence,
      headYawDeg: tracking.headPose?.yawDeg,
      headPitchDeg: tracking.headPose?.pitchDeg,
    });
    setRecordedSampleCount(active.samples.length);
  }, [cameraStatus, finishRecording, tracking]);

  const startRecording = () => {
    setErrorMessage("");
    setStatusMessage("");
    const repetition = Number(repetitionInput);
    if (!isValidParticipantId(participantId)) {
      setErrorMessage("Select a participant ID before recording.");
      return;
    }
    if (!referenceIsValid) {
      setErrorMessage("Enter a finite, positive physical reference distance.");
      return;
    }
    if (!protocolDistancesM?.some((distance) => Math.abs(distance - protocolDistanceM) < 0.000001)) {
      setErrorMessage("Choose a planned protocol distance condition.");
      return;
    }
    if (!Number.isInteger(repetition) || repetition < 1 || repetition > repetitionsPerDistance) {
      setErrorMessage("Choose a repetition within the configured protocol.");
      return;
    }
    if (!protocolValid) {
      setErrorMessage("Check the protocol distances, repetition count, and recording duration.");
      return;
    }
    if (!measuredOptotypeValid) {
      setErrorMessage("The optional measured optotype size must be a positive number.");
      return;
    }
    if (duplicateExists) {
      setErrorMessage("This participant, reference distance, and repetition already have a valid recording.");
      return;
    }
    if (!cameraCalibration) {
      setErrorMessage("Complete camera calibration before collecting experimental recordings.");
      return;
    }
    if (!trackingReady) {
      setErrorMessage("Wait for active face tracking and valid raw/EMA distances before recording.");
      return;
    }

    const startedAtMs = performance.now();
    const startedAtIso = new Date().toISOString();
    activeRecordingRef.current = {
      sessionId: crypto.randomUUID(),
      participantId,
      repetition,
      protocolDistanceM,
      referenceDistanceM,
      referenceDistanceUnit: referenceUnit,
      durationSec,
      emaAlpha: smoothingAlpha,
      cameraStatus: `${cameraCalibration.method} calibration (${cameraCalibration.calibratedAt})`,
      startedAtMs,
      startedAtIso,
      samples: [],
      trackingFailures: 0,
      lastObservedAtMs: null,
      measuredOptotypeMM: measuredOptotype,
    };
    setRecordedSampleCount(0);
    setTrackingFailures(0);
    setCountdownSec(durationSec);
    setIsRecording(true);
  };

  const selectedRecord =
    validRecords.find((record) => record.sessionId === selectedSessionId) ??
    validRecords[validRecords.length - 1] ??
    null;
  const selectedSamples = selectedRecord?.temporalSamples ?? [];
  const participantSummaries = useMemo(
    () =>
      VALIDATION_PARTICIPANT_IDS.map((id) => {
        const participantRecordings = validRecords.filter(
          (record) => normalizeValidationParticipantId(record.participantId) === id
        );
        const metrics = participantRecordings.map((record) =>
          calculateRealRecordingMetrics(record.temporalSamples ?? [], record.actualDistanceM)
        );
        const testedDistances = [...new Set(participantRecordings.map((record) => record.protocolDistanceM ?? record.actualDistanceM))]
          .sort((a, b) => a - b)
          .map((distance) => `${distance.toFixed(2)} m`)
          .join(", ");
        return {
          participantId: id,
          recordings: participantRecordings.length,
          testedDistances: testedDistances || "—",
          rawSdCm: meanOrNull(metrics.map((metric) => metric.rawSdM * 100)),
          emaSdCm: meanOrNull(metrics.map((metric) => metric.emaSdM * 100)),
          noiseReductionPct: meanOrNull(
            metrics.flatMap((metric) => metric.noiseReductionPct === null ? [] : [metric.noiseReductionPct])
          ),
          rawMaeCm: meanOrNull(metrics.map((metric) => metric.meanRawAbsoluteErrorM * 100)),
          emaMaeCm: meanOrNull(metrics.map((metric) => metric.meanEmaAbsoluteErrorM * 100)),
          rawBiasCm: meanOrNull(metrics.map((metric) => metric.meanRawErrorM * 100)),
          emaBiasCm: meanOrNull(metrics.map((metric) => metric.meanEmaErrorM * 100)),
          completed: protocolDistancesM
            ? protocolDistancesM.every((distance) =>
                Array.from({ length: repetitionsPerDistance }, (_, index) =>
                  participantRecordings.some(
                    (record) =>
                      Math.abs((record.protocolDistanceM ?? record.actualDistanceM) - distance) < 0.000001 &&
                      record.repetition === index + 1
                  )
                ).every(Boolean)
              )
            : false,
        };
      }),
    [validRecords, protocolDistancesM, repetitionsPerDistance]
  );
  const participantAverages = participantSummaries.filter((summary) => summary.recordings > 0);
  const rawMaeValues = participantAverages.flatMap((summary) => summary.rawMaeCm === null ? [] : [summary.rawMaeCm]);
  const emaMaeValues = participantAverages.flatMap((summary) => summary.emaMaeCm === null ? [] : [summary.emaMaeCm]);
  const noiseReductionValues = participantAverages.flatMap((summary) => summary.noiseReductionPct === null ? [] : [summary.noiseReductionPct]);
  const rawBiasValues = participantAverages.flatMap((summary) => summary.rawBiasCm === null ? [] : [summary.rawBiasCm]);
  const emaBiasValues = participantAverages.flatMap((summary) => summary.emaBiasCm === null ? [] : [summary.emaBiasCm]);
  const rawSdValues = participantAverages.flatMap((summary) => summary.rawSdCm === null ? [] : [summary.rawSdCm]);
  const emaSdValues = participantAverages.flatMap((summary) => summary.emaSdCm === null ? [] : [summary.emaSdCm]);
  const participantRmseValues = participantAverages.map((summary) => {
      const participantMetrics = validRecords
        .filter((record) => normalizeValidationParticipantId(record.participantId) === summary.participantId)
        .map((record) =>
          calculateRealRecordingMetrics(record.temporalSamples ?? [], record.actualDistanceM).emaRmseM * 100
        );
      return meanOrNull(participantMetrics) ?? 0;
    });
  const totalValidSamples = validRecords.reduce((sum, record) => sum + (record.sampleCount ?? record.temporalSamples?.length ?? 0), 0);
  const maxEmaAbsoluteErrorCm = validRecords.length
    ? Math.max(...validRecords.map((record) => (record.maxEmaAbsoluteErrorM ?? 0) * 100))
    : null;
  const distanceChartData = participantSummaries
    .filter((summary) => summary.recordings > 0)
    .map((summary) => ({
      participantId: summary.participantId,
      rawSdCm: summary.rawSdCm,
      emaSdCm: summary.emaSdCm,
      noiseReductionPct: summary.noiseReductionPct,
      rawMaeCm: summary.rawMaeCm,
      emaMaeCm: summary.emaMaeCm,
    }));
  const distanceErrorChartData = (protocolDistancesM ?? [])
    .map((distance) => {
      const distanceRecords = validRecords.filter(
        (record) => Math.abs((record.protocolDistanceM ?? record.actualDistanceM) - distance) < 0.000001
      );
      const metrics = distanceRecords.map((record) =>
        calculateRealRecordingMetrics(record.temporalSamples ?? [], record.actualDistanceM)
      );
      return {
        distanceLabel: `${distance.toFixed(2)} m`,
        rawMaeCm: meanOrNull(metrics.map((metric) => metric.meanRawAbsoluteErrorM * 100)),
        emaMaeCm: meanOrNull(metrics.map((metric) => metric.meanEmaAbsoluteErrorM * 100)),
        participantCount: new Set(distanceRecords.map((record) => record.participantId)).size,
      };
    })
    .filter((row) => row.participantCount >= 2);
  const missingCount = completion.missingCombinations.length;
  const failedCount = participantRecords.filter(
    (record) => record.recordingStatus && record.recordingStatus !== "VALID"
  ).length;

  const participantExportRows = participantSummaries.map((summary) => ({
    data_source: "RECORDED",
    participant_id: summary.participantId,
    valid_recordings: summary.recordings,
    reference_distances_m: summary.testedDistances,
    mean_raw_sd_cm: summary.rawSdCm,
    mean_ema_sd_cm: summary.emaSdCm,
    mean_noise_reduction_pct: summary.noiseReductionPct,
    mean_raw_mae_cm: summary.rawMaeCm,
    mean_ema_mae_cm: summary.emaMaeCm,
    mean_raw_bias_cm: summary.rawBiasCm,
    mean_ema_bias_cm: summary.emaBiasCm,
    completion_status: summary.completed ? "COMPLETE" : "INCOMPLETE",
  }));
  const recordingExportRows = participantRecords.map((record) => ({
    data_source: record.dataSource,
    session_id: record.sessionId,
    participant_id: record.participantId,
    repetition: record.repetition,
    protocol_distance_condition_m: record.protocolDistanceM,
    reference_distance_m: record.actualDistanceM,
    reference_distance_unit: record.referenceDistanceUnit,
    timestamp: record.recordingTimestamp ?? record.timestamp,
    recording_status: record.recordingStatus,
    ema_alpha: record.emaAlpha,
    valid_sample_count: record.sampleCount,
    tracking_failures: record.trackingFailures,
    duration_sec: record.durationSec,
    effective_fps: record.effectiveFps,
    raw_mean_m: record.meanRawDistanceM,
    ema_mean_m: record.estimatedDistanceM,
    mean_raw_error_m: record.meanRawErrorM,
    mean_ema_error_m: record.meanEmaErrorM,
    raw_sd_cm: record.rawSdCm,
    ema_sd_cm: record.smoothedSdCm,
    noise_reduction_pct: record.noiseReductionPct,
    raw_mae_cm: record.rawAbsoluteErrorM === undefined ? undefined : record.rawAbsoluteErrorM * 100,
    ema_mae_cm: record.emaAbsoluteErrorM === undefined ? undefined : record.emaAbsoluteErrorM * 100,
    ema_rmse_cm: record.emaRmseM === undefined ? undefined : record.emaRmseM * 100,
    raw_variance_m2: record.rawVarianceM2,
    ema_variance_m2: record.smoothedVarianceM2,
    max_ema_absolute_error_cm:
      record.maxEmaAbsoluteErrorM === undefined ? undefined : record.maxEmaAbsoluteErrorM * 100,
  }));
  const frameExportRows = participantRecords.flatMap((record) =>
    (record.temporalSamples ?? []).map((sample, index) => ({
      data_source: record.dataSource,
      session_id: record.sessionId,
      participant_id: record.participantId,
      repetition: record.repetition,
      protocol_distance_condition_m: record.protocolDistanceM,
      reference_distance_m: record.actualDistanceM,
      frame_index: index + 1,
      sample_timestamp: sample.timestamp,
      elapsed_time_sec: sample.timeSec,
      raw_distance_m: sample.rawDistanceM,
      ema_distance_m: sample.smoothedDistanceM,
      ipd_pixels: sample.ipdPixels,
      confidence: sample.confidence,
      head_yaw_deg: sample.headYawDeg,
      head_pitch_deg: sample.headPitchDeg,
      raw_absolute_error_m: Math.abs(sample.rawDistanceM - record.actualDistanceM),
      ema_absolute_error_m: Math.abs(sample.smoothedDistanceM - record.actualDistanceM),
      raw_percentage_error:
        (Math.abs(sample.rawDistanceM - record.actualDistanceM) / record.actualDistanceM) * 100,
      ema_percentage_error:
        (Math.abs(sample.smoothedDistanceM - record.actualDistanceM) / record.actualDistanceM) * 100,
      recording_status: record.recordingStatus,
    }))
  );
  const studyMetadata = {
    dataSource: "RECORDED",
    exportTimestamp: new Date().toISOString(),
    participantIds: [...VALIDATION_PARTICIPANT_IDS],
    referenceDistancesM: protocolDistancesM ?? [],
    repetitionsPerDistance,
    recordingDurationSec: durationSec,
    emaAlpha: smoothingAlpha,
    validRecordingCount: validRecords.length,
    allParticipantAttempts: participantRecords.length,
    sampleSdConvention: "Sample SD with Bessel's correction (N-1)",
    cohortAggregation:
      "Participant-level results weight each participant equally; recording metrics are averaged within participant. Frame-level samples are exported separately.",
    prototypeNotice: "Engineering research prototype; not a clinically certified visual-acuity assessment.",
  };
  const csvMetadata = {
    ...studyMetadata,
    participantIds: studyMetadata.participantIds.join(", "),
    referenceDistancesM: studyMetadata.referenceDistancesM.join(", "),
  };

  return (
    <section className="card" aria-labelledby="real-validation-title">
      <div className="flex-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 id="real-validation-title" style={{ margin: 0 }}>Real Participant EMA Validation</h3>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Numerical distance tracking only. No video, face images, or image frames are stored.
          </p>
        </div>
        <span className={`badge ${participantRecords.length > 0 || isRecording ? "good" : "neutral"}`}>
          {isRecording
            ? "REAL HUMAN DATA — RECORDING"
            : participantRecords.length > 0
              ? "REAL HUMAN DATA — RECORDED"
              : "REAL HUMAN DATA — AWAITING RECORDINGS"}
        </span>
      </div>

      <div className="card-grid" style={{ alignItems: "start", marginTop: 16 }}>
        <div className="field">
          <label htmlFor="participant-id">Anonymous participant ID</label>
          <select
            id="participant-id"
            value={participantId}
            onChange={(event) => setParticipantId(event.target.value)}
            disabled={isRecording}
          >
            <option value="">Select participant</option>
            {VALIDATION_PARTICIPANT_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="protocol-distance-condition">Planned distance condition</label>
          <select
            id="protocol-distance-condition"
            value={protocolDistanceInput}
            onChange={(event) => setProtocolDistanceInput(event.target.value)}
            disabled={isRecording}
          >
            <option value="">Select condition</option>
            {(protocolDistancesM ?? []).map((distance) => (
              <option key={distance} value={distance}>{distance.toFixed(2)} m</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="reference-distance">Physical reference distance</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="reference-distance"
              type="number"
              min="0"
              step="any"
              value={referenceDistanceInput}
              onChange={(event) => setReferenceDistanceInput(event.target.value)}
              disabled={isRecording}
              aria-invalid={referenceDistanceInput !== "" && !referenceIsValid}
            />
            <select
              aria-label="Reference distance unit"
              value={referenceUnit}
              onChange={(event) => setReferenceUnit(event.target.value as ReferenceUnit)}
              disabled={isRecording}
            >
              <option value="m">m</option>
              <option value="cm">cm</option>
              <option value="ft">ft</option>
              <option value="in">in</option>
            </select>
          </div>
          <span className="muted small">Measure with a tape or laser meter; it is never replaced with the webcam estimate.</span>
        </div>
        <div className="field">
          <label htmlFor="repetition">Recording / repetition number</label>
          <select
            id="repetition"
            value={repetitionInput}
            onChange={(event) => setRepetitionInput(event.target.value)}
            disabled={isRecording || !Number.isInteger(repetitionsPerDistance)}
          >
            {Array.from({ length: Math.min(Math.max(repetitionsPerDistance, 1), 20) }, (_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="muted small">
        Camera calibration: {cameraCalibration ? `Ready (${cameraCalibration.method}, calibrated ${new Date(cameraCalibration.calibratedAt).toLocaleDateString()})` : "Required — complete camera calibration before a study recording."}
        {" · "}Tracking: {trackingReady ? "Ready" : cameraStatus === "streaming" ? "Waiting for valid face tracking" : "Camera not streaming"}
        {" · "}EMA α = {smoothingAlpha.toFixed(2)}
      </p>

      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-label">Current raw distance</div>
          <div className="stat-value">{formatMeters(currentRawM ?? undefined)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current EMA distance</div>
          <div className="stat-value">{formatMeters(currentEmaM ?? undefined)}</div>
        </div>
      </div>

      <div className="card-grid" style={{ alignItems: "start", marginTop: 12 }}>
        <div className="field">
          <label htmlFor="measured-optotype">Optional measured Tumbling E height (mm)</label>
          <input
            id="measured-optotype"
            type="number"
            min="0"
            step="any"
            value={measuredOptotypeInput}
            onChange={(event) => setMeasuredOptotypeInput(event.target.value)}
            disabled={isRecording}
          />
        </div>
        <div className="field">
          <label htmlFor="recording-duration">Recording duration (seconds)</label>
          <input
            id="recording-duration"
            type="number"
            min="1"
            max="30"
            step="1"
            value={durationInput}
            onChange={(event) => setDurationInput(event.target.value)}
            disabled={isRecording}
          />
        </div>
        <div className="btn-row" style={{ alignSelf: "end" }}>
          {!isRecording ? (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              disabled={!trackingReady || !cameraCalibration || !participantId || !Number.isFinite(protocolDistanceM) || !referenceIsValid || !protocolValid || duplicateExists}
            >
              Start {durationSec} s recording
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={() => void finishRecording("CANCELLED")}>
              Stop and save incomplete attempt
            </button>
          )}
        </div>
      </div>
      {isRecording && (
        <p className="badge bad" role="status" aria-live="polite" style={{ marginTop: 12 }}>
          RECORDING — {countdownSec.toFixed(1)} s remaining · {recordedSampleCount} samples · {trackingFailures} tracking failures
        </p>
      )}
      {duplicateExists && <p className="badge neutral" role="status">A valid recording already exists for this participant, distance condition, and repetition. Select another protocol slot.</p>}
      {statusMessage && <p className="badge neutral" role="status">{statusMessage}</p>}
      {errorMessage && <p className="badge bad" role="alert">{errorMessage}</p>}

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Configure study protocol</summary>
        <div className="card-grid" style={{ alignItems: "start", marginTop: 12 }}>
          <div className="field">
            <label htmlFor="protocol-distances">Planned reference distances (m, comma-separated)</label>
            <input
              id="protocol-distances"
              value={protocolDistancesInput}
              onChange={(event) => setProtocolDistancesInput(event.target.value)}
              disabled={isRecording}
            />
          </div>
          <div className="field">
            <label htmlFor="protocol-repetitions">Repetitions per distance</label>
            <input
              id="protocol-repetitions"
              type="number"
              min="1"
              max="20"
              step="1"
              value={repetitionsInput}
              onChange={(event) => setRepetitionsInput(event.target.value)}
              disabled={isRecording}
            />
          </div>
        </div>
        {!protocolValid && <p className="badge bad">Use positive distances, 1–20 repetitions, and a 1–30 second duration.</p>}
      </details>

      <h4 style={{ margin: "22px 0 8px" }}>Experimental overview</h4>
      {validRecords.length === 0 ? (
        <div className="card" style={{ background: "var(--surface-alt)" }}>
          <strong>Data collection has not started.</strong>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Complete camera calibration, select a participant, physically measure the reference distance, and record valid webcam samples. No synthetic values are used in this experimental area.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          <Stat label="Participants with valid recordings" value={String(new Set(validRecords.map((record) => record.participantId)).size)} />
          <Stat label="Valid recordings" value={String(validRecords.length)} />
          <Stat label="Valid temporal samples" value={String(totalValidSamples)} />
          <Stat label="Planned recordings" value={protocolValid ? String(completion.planned) : "—"} />
          <Stat label="Raw MAE (participant mean ± SD)" value={formatParticipantMeanSd(rawMaeValues, "cm")} />
          <Stat label="EMA MAE (participant mean ± SD)" value={formatParticipantMeanSd(emaMaeValues, "cm")} />
          <Stat label="Raw sample SD (participant mean ± SD)" value={formatParticipantMeanSd(rawSdValues, "cm")} />
          <Stat label="EMA sample SD (participant mean ± SD)" value={formatParticipantMeanSd(emaSdValues, "cm")} />
          <Stat label="Raw signed error (participant mean ± SD)" value={formatParticipantMeanSd(rawBiasValues, "cm")} />
          <Stat label="EMA signed error (participant mean ± SD)" value={formatParticipantMeanSd(emaBiasValues, "cm")} />
          <Stat label="Noise reduction (participant mean ± SD)" value={noiseReductionValues.length ? formatParticipantMeanSd(noiseReductionValues, "%") : "N/A (zero raw SD)"} />
          <Stat label="EMA RMSE (participant mean ± SD)" value={formatParticipantMeanSd(participantRmseValues, "cm")} />
          <Stat label="Maximum EMA absolute error (pooled recordings)" value={maxEmaAbsoluteErrorCm === null ? "—" : `${maxEmaAbsoluteErrorCm.toFixed(2)} cm`} />
          <Stat label="Completed planned slots" value={`${completion.completed} / ${completion.planned}`} />
        </div>
      )}
      {validRecords.length > 0 && (
        <p className="muted small">
          MAE is the mean frame-level absolute distance error, first averaged across recordings within each participant and then equally across participants. RMSE uses the same participant-equal aggregation. Reduced variability describes temporal stability; it does not establish improved absolute accuracy.
        </p>
      )}
      <p className="muted small">
        Incomplete/failed attempts: {failedCount} · Missing participant-distance-repetition slots: {missingCount}.
        {completion.missingCombinations.length > 0 && (
          <> First missing slots: {completion.missingCombinations.slice(0, 6).join("; ")}{missingCount > 6 ? "…" : ""}.</>
        )}
      </p>

      <div className="flex-between" style={{ flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <h4 style={{ margin: 0 }}>Participant results</h4>
        <div className="btn-row">
          <button className="btn btn-secondary btn-sm" disabled={participantRecords.length === 0} onClick={() => downloadCSV("validation-participants.csv", participantExportRows, undefined, { ...csvMetadata, exportTimestamp: new Date().toISOString() })}>Participant CSV</button>
          <button className="btn btn-secondary btn-sm" disabled={participantRecords.length === 0} onClick={() => downloadCSV("validation-recordings.csv", recordingExportRows, undefined, { ...csvMetadata, exportTimestamp: new Date().toISOString() })}>Recording CSV</button>
          <button className="btn btn-secondary btn-sm" disabled={participantRecords.length === 0} onClick={() => downloadCSV("validation-frame-samples.csv", frameExportRows, undefined, { ...csvMetadata, exportTimestamp: new Date().toISOString() })}>Frame CSV</button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={participantRecords.length === 0}
            onClick={() => downloadJSON("real-human-validation.json", {
              metadata: { ...studyMetadata, exportTimestamp: new Date().toISOString() },
              participants: participantExportRows,
              recordings: participantRecords,
            })}
          >
            Export real-data JSON
          </button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Participant</th><th>Valid recordings</th><th>Distances tested</th><th>Mean raw SD</th><th>Mean EMA SD</th><th>Mean noise reduction</th><th>Raw MAE</th><th>EMA MAE</th><th>Protocol status</th></tr>
          </thead>
          <tbody>
            {participantSummaries.map((summary) => (
              <tr key={summary.participantId}>
                <td>{summary.participantId}</td><td>{summary.recordings}</td><td>{summary.testedDistances}</td>
                <td>{summary.rawSdCm === null ? "—" : `${summary.rawSdCm.toFixed(2)} cm`}</td>
                <td>{summary.emaSdCm === null ? "—" : `${summary.emaSdCm.toFixed(2)} cm`}</td>
                <td>{summary.noiseReductionPct === null ? "N/A" : `${summary.noiseReductionPct.toFixed(2)}%`}</td>
                <td>{summary.rawMaeCm === null ? "—" : `${summary.rawMaeCm.toFixed(2)} cm`}</td>
                <td>{summary.emaMaeCm === null ? "—" : `${summary.emaMaeCm.toFixed(2)} cm`}</td>
                <td>{summary.completed ? "Complete" : "Incomplete"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {validRecords.length > 0 && (
        <>
          <div className="field" style={{ maxWidth: 480, marginTop: 18 }}>
            <label htmlFor="recording-detail">Recording-level details and time series</label>
            <select
              id="recording-detail"
              value={selectedRecord?.sessionId ?? ""}
              onChange={(event) => setSelectedSessionId(event.target.value)}
            >
              {validRecords.map((record) => (
                <option key={record.sessionId} value={record.sessionId}>
                  {record.participantId} · {record.actualDistanceM.toFixed(2)} m · rep {record.repetition} · {new Date(record.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
          {selectedRecord && (
            <>
              <div className="card-grid">
                <Stat label="Reference distance" value={formatMeters(selectedRecord.actualDistanceM)} />
                <Stat label="Mean raw / EMA distance" value={`${formatMeters(selectedRecord.meanRawDistanceM)} / ${formatMeters(selectedRecord.estimatedDistanceM)}`} />
                <Stat label="Raw / EMA sample SD" value={`${formatCentimeters(selectedRecord.rawSdCm)} / ${formatCentimeters(selectedRecord.smoothedSdCm)}`} />
                <Stat label="Raw absolute / percentage error" value={`${formatCentimeters((selectedRecord.rawAbsoluteErrorM ?? Number.NaN) * 100)} / ${selectedRecord.meanRawPercentageError?.toFixed(2) ?? "—"}%`} />
                <Stat label="EMA absolute / percentage error" value={`${formatCentimeters((selectedRecord.emaAbsoluteErrorM ?? Number.NaN) * 100)} / ${selectedRecord.meanEmaPercentageError?.toFixed(2) ?? "—"}%`} />
                <Stat label="Noise reduction" value={selectedRecord.noiseReductionPct === null || selectedRecord.noiseReductionPct === undefined ? "N/A (zero raw SD)" : `${selectedRecord.noiseReductionPct.toFixed(2)}%`} />
                <Stat label="Raw / EMA sample variance" value={`${selectedRecord.rawVarianceM2?.toFixed(8) ?? "—"} / ${selectedRecord.smoothedVarianceM2?.toFixed(8) ?? "—"} m²`} />
                <Stat label="Samples / duration / frequency" value={`${selectedRecord.sampleCount ?? selectedSamples.length} / ${(selectedRecord.durationSec ?? 0).toFixed(2)} s / ${selectedRecord.effectiveFps?.toFixed(1) ?? "—"} fps`} />
                <Stat label="EMA alpha" value={selectedRecord.emaAlpha?.toFixed(2) ?? "—"} />
                <Stat label="Raw / EMA maximum absolute error" value={`${formatCentimeters(selectedRecord.maxRawAbsoluteErrorM === undefined ? undefined : selectedRecord.maxRawAbsoluteErrorM * 100)} / ${formatCentimeters(selectedRecord.maxEmaAbsoluteErrorM === undefined ? undefined : selectedRecord.maxEmaAbsoluteErrorM * 100)}`} />
                <Stat label="Status / failures" value={`${selectedRecord.recordingStatus} / ${selectedRecord.trackingFailures ?? 0}`} />
              </div>
              <p className="muted small">
                {new Date(selectedRecord.timestamp).toLocaleString()} · {selectedRecord.cameraStatus ?? "Camera calibration metadata unavailable"} · Noise reduction is undefined when raw SD is zero. Negative values indicate noise inflation.
              </p>
              <DistanceSmoothingChart
                samples={selectedSamples}
                title={`${selectedRecord.participantId} — raw and EMA distance over time`}
                referenceDistanceM={selectedRecord.actualDistanceM}
                alpha={selectedRecord.emaAlpha}
              />
            </>
          )}
        </>
      )}

      <h4 style={{ margin: "22px 0 8px" }}>Cohort charts — recorded participants only</h4>
      {distanceChartData.length === 0 ? (
        <p className="muted small">Charts will appear when valid real participant recordings are available.</p>
      ) : (
        <div className="card-grid">
          <MetricChart title="Raw and EMA sample SD by participant (cm)" rows={distanceChartData} xKey="participantId" firstKey="rawSdCm" secondKey="emaSdCm" firstLabel="Raw SD" secondLabel="EMA SD" />
          <MetricChart title="Noise reduction by participant (%)" rows={distanceChartData} xKey="participantId" firstKey="noiseReductionPct" firstLabel="Noise reduction" />
          <MetricChart title="Frame-level absolute error by participant (cm)" rows={distanceChartData} xKey="participantId" firstKey="rawMaeCm" secondKey="emaMaeCm" firstLabel="Raw MAE" secondLabel="EMA MAE" />
          {distanceErrorChartData.length >= 2 && (
            <MetricChart title="Mean frame-level absolute error by reference distance (cm; ≥2 participants)" rows={distanceErrorChartData} xKey="distanceLabel" firstKey="rawMaeCm" secondKey="emaMaeCm" firstLabel="Raw MAE" secondLabel="EMA MAE" />
          )}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 18 }}>
        This engineering research prototype is not a clinically certified visual-acuity assessment. Results describe collected recordings only and do not imply clinical validity or statistical significance.
      </p>
    </section>
  );
}

function formatCentimeters(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) ? `${value.toFixed(2)} cm` : "—";
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>;
}

function MetricChart({
  title,
  rows,
  xKey,
  firstKey,
  secondKey,
  firstLabel,
  secondLabel,
}: {
  title: string;
  rows: Record<string, string | number | null>[];
  xKey: string;
  firstKey: string;
  secondKey?: string;
  firstLabel: string;
  secondLabel?: string;
}) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <h4>{title}</h4>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey={firstKey} name={firstLabel} fill="var(--accent)" />
            {secondKey && <Bar dataKey={secondKey} name={secondLabel} fill="var(--good)" />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
