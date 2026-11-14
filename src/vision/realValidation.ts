import {
  calculateNoiseReduction,
  mean,
  percentageError,
  sampleStdDev,
  sampleVariance,
} from "../utils/math";
import type { TemporalDistanceSample } from "./distanceSmoothing";
import type { ValidationRecord } from "../utils/storage";

export const VALIDATION_PARTICIPANT_IDS = [
  "PO1", "PO2", "PO3", "PO4", "PO5", "PO6", "PO7",
  "PO8", "PO9", "PO10", "PO11", "PO12", "PO13",
] as const;

export type ValidationParticipantId = (typeof VALIDATION_PARTICIPANT_IDS)[number];

export type EmaVariabilityClassification = "Low variability" | "Medium variability" | "High variability";

export interface ParticipantEmaStabilitySummary {
  participantId: ValidationParticipantId;
  eligibleRecordingCount: number;
  participantEmaSdCm: number | null;
  variabilityClassification: EmaVariabilityClassification | null;
  meanDistanceAbsoluteErrorCm: number | null;
  noiseReductionPct: number | null;
  dataStatus: "Eligible" | "Awaiting eligible data";
}

export interface PilotEmaStabilitySummary {
  totalIntendedParticipants: number;
  includedParticipantCount: number;
  awaitingEligibleParticipantCount: number;
  q1Cm: number | null;
  medianCm: number | null;
  q3Cm: number | null;
  hasSufficientData: boolean;
  participantSummaries: ParticipantEmaStabilitySummary[];
}

export const DEFAULT_VALIDATION_PROTOCOL = {
  referenceDistancesM: [1, 1.5, 2],
  repetitionsPerDistance: 3,
  durationSec: 3,
} as const;

export interface RealRecordingMetrics {
  validSampleCount: number;
  meanRawDistanceM: number;
  meanEmaDistanceM: number;
  meanRawErrorM: number;
  meanEmaErrorM: number;
  meanRawAbsoluteErrorM: number;
  meanEmaAbsoluteErrorM: number;
  meanRawPercentageError: number;
  meanEmaPercentageError: number;
  rawSdM: number;
  emaSdM: number;
  rawVarianceM2: number;
  emaVarianceM2: number;
  noiseReductionPct: number | null;
  maxRawAbsoluteErrorM: number;
  maxEmaAbsoluteErrorM: number;
  emaRmseM: number;
}

export function isValidReferenceDistance(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function normalizeValidationParticipantId(value: string | undefined): ValidationParticipantId | null {
  const match = value?.trim().toUpperCase().match(/^P(?:O)?0?(\d{1,2})$/);
  if (!match) return null;
  const participantNumber = Number(match[1]);
  return participantNumber >= 1 && participantNumber <= VALIDATION_PARTICIPANT_IDS.length
    ? `PO${participantNumber}` as ValidationParticipantId
    : null;
}

export function isValidParticipantId(value: string): boolean {
  return normalizeValidationParticipantId(value) !== null;
}

export function calculateQuartile(values: number[], probability: number): number | null {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return null;
  const sorted = [...finiteValues].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  const lowerValue = sorted[lower];
  const upperValue = sorted[Math.min(lower + 1, sorted.length - 1)];
  return lowerValue + fraction * (upperValue - lowerValue);
}

export function classifyParticipantEmaStability(
  participantEmaSdCm: number,
  q1Cm: number | null,
  q3Cm: number | null
): EmaVariabilityClassification | null {
  if (
    !Number.isFinite(participantEmaSdCm) ||
    q1Cm === null ||
    q3Cm === null ||
    !Number.isFinite(q1Cm) ||
    !Number.isFinite(q3Cm)
  ) {
    return null;
  }
  if (participantEmaSdCm < q1Cm) return "Low variability";
  if (participantEmaSdCm <= q3Cm) return "Medium variability";
  return "High variability";
}

export function calculatePilotEmaStabilityClassification(
  records: ValidationRecord[]
): PilotEmaStabilitySummary {
  const eligibleRecords = getValidExperimentalRecords(records);
  const participantSummaries = VALIDATION_PARTICIPANT_IDS.map((participantId) => {
    const participantRecords = eligibleRecords.filter(
      (record) => normalizeValidationParticipantId(record.participantId) === participantId
    );
    if (participantRecords.length === 0) {
      return {
        participantId,
        eligibleRecordingCount: 0,
        participantEmaSdCm: null,
        variabilityClassification: null,
        meanDistanceAbsoluteErrorCm: null,
        noiseReductionPct: null,
        dataStatus: "Awaiting eligible data",
      } satisfies ParticipantEmaStabilitySummary;
    }

    const metrics = participantRecords.map((record) => ({
      record,
      metrics: calculateRealRecordingMetrics(record.temporalSamples ?? [], record.actualDistanceM),
    }));
    const participantEmaSdCm = mean(
      metrics.map(({ metrics }) => metrics.emaSdM * 100)
    );
    const meanDistanceAbsoluteErrorCm = mean(
      metrics.map(({ record, metrics }) => Math.abs(metrics.meanEmaDistanceM - record.actualDistanceM) * 100)
    );
    const noiseReductionValues = metrics
      .map(({ metrics }) => metrics.noiseReductionPct)
      .filter((value): value is number => Number.isFinite(value));
    const noiseReductionPct = noiseReductionValues.length ? mean(noiseReductionValues) : null;

    return {
      participantId,
      eligibleRecordingCount: metrics.length,
      participantEmaSdCm: Number.isFinite(participantEmaSdCm) ? participantEmaSdCm : null,
      variabilityClassification: null,
      meanDistanceAbsoluteErrorCm: Number.isFinite(meanDistanceAbsoluteErrorCm) ? meanDistanceAbsoluteErrorCm : null,
      noiseReductionPct,
      dataStatus: "Eligible",
    } satisfies ParticipantEmaStabilitySummary;
  });

  const participantValues = participantSummaries
    .map((summary) => summary.participantEmaSdCm)
    .filter((value): value is number => Number.isFinite(value));

  const hasSufficientData = participantValues.length >= 2;
  const q1Cm = hasSufficientData ? calculateQuartile(participantValues, 0.25) : null;
  const medianCm = hasSufficientData ? calculateQuartile(participantValues, 0.5) : null;
  const q3Cm = hasSufficientData ? calculateQuartile(participantValues, 0.75) : null;

  const augmented = participantSummaries.map((summary) => ({
    ...summary,
    variabilityClassification:
      summary.participantEmaSdCm === null
        ? null
        : classifyParticipantEmaStability(summary.participantEmaSdCm, q1Cm, q3Cm),
  }));

  const includedParticipantCount = augmented.filter((summary) => summary.participantEmaSdCm !== null).length;
  const awaitingEligibleParticipantCount = augmented.filter((summary) => summary.participantEmaSdCm === null).length;

  return {
    totalIntendedParticipants: VALIDATION_PARTICIPANT_IDS.length,
    includedParticipantCount,
    awaitingEligibleParticipantCount,
    q1Cm,
    medianCm,
    q3Cm,
    hasSufficientData,
    participantSummaries: augmented,
  };
}

export function isEligibleRecordedEmaRecording(record: ValidationRecord): boolean {
  return (
    record.dataSource === "RECORDED" &&
    (record.recordingStatus === undefined || record.recordingStatus === "VALID") &&
    isValidReferenceDistance(record.actualDistanceM) &&
    (record.temporalSamples?.filter(
      (sample) =>
        Number.isFinite(sample.timeSec) &&
        sample.timeSec >= 0 &&
        Number.isFinite(sample.rawDistanceM) &&
        sample.rawDistanceM > 0 &&
        Number.isFinite(sample.smoothedDistanceM) &&
        sample.smoothedDistanceM > 0
    ).length ?? 0) >= 2
  );
}

export interface NewUserEmaClassification {
  emaSdCm: number;
  q1Cm: number | null;
  q3Cm: number | null;
  classification: EmaVariabilityClassification | null;
}

export function classifyNewUserEmaRecording(
  record: ValidationRecord | null,
  pilotSummary: PilotEmaStabilitySummary
): NewUserEmaClassification | null {
  if (
    record === null ||
    Boolean(record.participantId?.trim()) ||
    !isEligibleRecordedEmaRecording(record)
  ) {
    return null;
  }

  const emaSdCm = calculateRealRecordingMetrics(record.temporalSamples ?? [], record.actualDistanceM).emaSdM * 100;
  if (!Number.isFinite(emaSdCm)) return null;
  const q1Cm = pilotSummary.hasSufficientData ? pilotSummary.q1Cm : null;
  const q3Cm = pilotSummary.hasSufficientData ? pilotSummary.q3Cm : null;

  return {
    emaSdCm,
    q1Cm,
    q3Cm,
    classification: classifyParticipantEmaStability(emaSdCm, q1Cm, q3Cm),
  };
}

export function getAdditionalDistanceRecords(records: ValidationRecord[]): ValidationRecord[] {
  return records.filter((record) => !record.participantId?.trim());
}

export function parseProtocolDistances(value: string): number[] | null {
  const distances = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  if (distances.length === 0 || distances.some((distance) => !isValidReferenceDistance(distance))) {
    return null;
  }
  return [...new Set(distances)].sort((a, b) => a - b);
}

export function calculateRealRecordingMetrics(
  samples: TemporalDistanceSample[],
  referenceDistanceM: number
): RealRecordingMetrics {
  if (!isValidReferenceDistance(referenceDistanceM)) {
    throw new Error("Reference distance must be a finite, positive number.");
  }

  const validSamples = samples.filter(
    (sample) =>
      Number.isFinite(sample.timeSec) &&
      sample.timeSec >= 0 &&
      Number.isFinite(sample.rawDistanceM) &&
      sample.rawDistanceM > 0 &&
      Number.isFinite(sample.smoothedDistanceM) &&
      sample.smoothedDistanceM > 0
  );
  if (validSamples.length < 2) {
    throw new Error("At least two valid tracked samples are required to calculate recording metrics.");
  }

  const raw = validSamples.map((sample) => sample.rawDistanceM);
  const ema = validSamples.map((sample) => sample.smoothedDistanceM);
  const rawErrors = raw.map((distance) => distance - referenceDistanceM);
  const emaErrors = ema.map((distance) => distance - referenceDistanceM);
  const rawAbsoluteErrors = rawErrors.map(Math.abs);
  const emaAbsoluteErrors = emaErrors.map(Math.abs);
  const rawSdM = sampleStdDev(raw);
  const emaSdM = sampleStdDev(ema);

  return {
    validSampleCount: validSamples.length,
    meanRawDistanceM: mean(raw),
    meanEmaDistanceM: mean(ema),
    meanRawErrorM: mean(rawErrors),
    meanEmaErrorM: mean(emaErrors),
    meanRawAbsoluteErrorM: mean(rawAbsoluteErrors),
    meanEmaAbsoluteErrorM: mean(emaAbsoluteErrors),
    meanRawPercentageError: mean(raw.map((distance) => percentageError(distance, referenceDistanceM))),
    meanEmaPercentageError: mean(ema.map((distance) => percentageError(distance, referenceDistanceM))),
    rawSdM,
    emaSdM,
    rawVarianceM2: sampleVariance(raw),
    emaVarianceM2: sampleVariance(ema),
    noiseReductionPct: calculateNoiseReduction(rawSdM, emaSdM),
    maxRawAbsoluteErrorM: Math.max(...rawAbsoluteErrors),
    maxEmaAbsoluteErrorM: Math.max(...emaAbsoluteErrors),
    emaRmseM: Math.sqrt(mean(emaErrors.map((error) => error ** 2))),
  };
}

export function getValidExperimentalRecords(records: ValidationRecord[]): ValidationRecord[] {
  return records.filter(
    (record) =>
      normalizeValidationParticipantId(record.participantId) !== null &&
      isEligibleRecordedEmaRecording(record)
  );
}

export function isDuplicateValidRecording(
  records: ValidationRecord[],
  participantId: string,
  repetition: number,
  protocolDistanceM: number
): boolean {
  const normalizedParticipantId = normalizeValidationParticipantId(participantId);
  if (normalizedParticipantId === null) return false;
  return getValidExperimentalRecords(records).some(
    (record) =>
      normalizeValidationParticipantId(record.participantId) === normalizedParticipantId &&
      record.repetition === repetition &&
      Math.abs((record.protocolDistanceM ?? record.actualDistanceM) - protocolDistanceM) < 0.000001
  );
}

export function getRecordingDurationSec(samples: TemporalDistanceSample[]): number {
  if (samples.length < 2) return 0;
  const times = samples.map((sample) => sample.timeSec).filter(Number.isFinite);
  return times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0;
}

export function getStudyCompletion(
  records: ValidationRecord[],
  referenceDistancesM: number[],
  repetitionsPerDistance: number
): { planned: number; completed: number; missingCombinations: string[] } {
  const validRecords = getValidExperimentalRecords(records);
  const expected = VALIDATION_PARTICIPANT_IDS.flatMap((participantId) =>
    referenceDistancesM.flatMap((distance) =>
      Array.from({ length: repetitionsPerDistance }, (_, index) => ({
        participantId,
        distance,
        repetition: index + 1,
      }))
    )
  );
  const missingCombinations = expected
    .filter(
      ({ participantId, distance, repetition }) =>
        !validRecords.some(
          (record) =>
            normalizeValidationParticipantId(record.participantId) === participantId &&
            record.repetition === repetition &&
            Math.abs((record.protocolDistanceM ?? record.actualDistanceM) - distance) < 0.000001
        )
    )
    .map(({ participantId, distance, repetition }) => `${participantId} / ${distance} m / rep ${repetition}`);

  return {
    planned: expected.length,
    completed: expected.length - missingCombinations.length,
    missingCombinations,
  };
}
