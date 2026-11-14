import { describe, expect, it } from "vitest";
import { toCSV } from "../utils/csvExport";
import type { ValidationRecord } from "../utils/storage";
import type { TemporalDistanceSample } from "../vision/distanceSmoothing";
import {
  calculateQuartile,
  classifyNewUserEmaRecording,
  calculatePilotEmaStabilityClassification,
  calculateRealRecordingMetrics,
  classifyParticipantEmaStability,
  getAdditionalDistanceRecords,
  getStudyCompletion,
  getValidExperimentalRecords,
  isDuplicateValidRecording,
  isValidParticipantId,
  isValidReferenceDistance,
  parseProtocolDistances,
} from "../vision/realValidation";

const samples: TemporalDistanceSample[] = [
  { timeSec: 0, rawDistanceM: 1.01, smoothedDistanceM: 1.005, referenceDistanceM: 1 },
  { timeSec: 0.1, rawDistanceM: 0.99, smoothedDistanceM: 1.002, referenceDistanceM: 1 },
  { timeSec: 0.2, rawDistanceM: 1.02, smoothedDistanceM: 1.006, referenceDistanceM: 1 },
];

function makeRecord(overrides: Partial<ValidationRecord> = {}): ValidationRecord {
  return {
    sessionId: "session-1",
    participantId: "P01",
    repetition: 1,
    referenceDistanceUnit: "m",
    timestamp: "2026-01-01T00:00:00.000Z",
    actualDistanceM: 1,
    estimatedDistanceM: 1,
    absoluteErrorM: 0,
    percentageError: 0,
    ipdPixels: 100,
    headYawDeg: 0,
    headPitchDeg: 0,
    confidence: 1,
    targetOptotypeMM: 1,
    renderedOptotypePX: 1,
    measuredOptotypeMM: null,
    passFail: "PASS",
    temporalSamples: samples,
    dataSource: "RECORDED",
    recordingStatus: "VALID",
    ...overrides,
  };
}

describe("real participant validation", () => {
  it("validates positive finite reference distances and configurable protocol inputs", () => {
    expect(isValidParticipantId("P01")).toBe(true);
    expect(isValidParticipantId("PO1")).toBe(true);
    expect(isValidParticipantId("PO13")).toBe(true);
    expect(isValidParticipantId("V01")).toBe(false);
    expect(isValidParticipantId("P14")).toBe(false);
    expect(isValidReferenceDistance(1)).toBe(true);
    expect(isValidReferenceDistance(0)).toBe(false);
    expect(isValidReferenceDistance(Number.NaN)).toBe(false);
    expect(parseProtocolDistances("1, 1.5, 2")).toEqual([1, 1.5, 2]);
    expect(parseProtocolDistances("1, 0, 2")).toBeNull();
    expect(parseProtocolDistances("")).toBeNull();
  });

  it("calculates sample SD, variance, errors, RMSE and unclamped noise inflation", () => {
    const metrics = calculateRealRecordingMetrics(samples, 1);
    expect(metrics.validSampleCount).toBe(3);
    expect(metrics.meanRawDistanceM).toBeCloseTo(1.0066667, 6);
    expect(metrics.rawSdM).toBeCloseTo(Math.sqrt(0.0002333333), 5);
    expect(metrics.rawVarianceM2).toBeCloseTo(metrics.rawSdM ** 2, 10);
    expect(metrics.meanRawAbsoluteErrorM).toBeCloseTo(0.0133333, 5);
    expect(metrics.emaRmseM).toBeGreaterThan(0);

    const inflated = calculateRealRecordingMetrics(
      [
        { timeSec: 0, rawDistanceM: 1, smoothedDistanceM: 0.9, referenceDistanceM: 1 },
        { timeSec: 1, rawDistanceM: 1.01, smoothedDistanceM: 1.1, referenceDistanceM: 1 },
      ],
      1
    );
    expect(inflated.noiseReductionPct).toBeLessThan(0);
  });

  it("marks zero raw variance as not applicable and rejects insufficient or invalid samples", () => {
    const metrics = calculateRealRecordingMetrics(
      [
        { timeSec: 0, rawDistanceM: 1, smoothedDistanceM: 1, referenceDistanceM: 1 },
        { timeSec: 1, rawDistanceM: 1, smoothedDistanceM: 1.1, referenceDistanceM: 1 },
      ],
      1
    );
    expect(metrics.noiseReductionPct).toBeNull();
    expect(() =>
      calculateRealRecordingMetrics([{ timeSec: 0, rawDistanceM: 1, smoothedDistanceM: 1, referenceDistanceM: 1 }], 1)
    ).toThrow(/two valid tracked samples/);
    expect(() => calculateRealRecordingMetrics(samples, 0)).toThrow(/positive number/);
  });

  it("filters out simulations, incomplete attempts, non-cohort rows, and invalid sample sets", () => {
    const real = makeRecord();
    const records = [
      real,
      makeRecord({ sessionId: "sim", dataSource: "SIMULATED" }),
      makeRecord({ sessionId: "failed", recordingStatus: "TRACKING_LOST" }),
      makeRecord({ sessionId: "legacy", participantId: undefined }),
      makeRecord({
        sessionId: "bad-samples",
        temporalSamples: [{ timeSec: 0, rawDistanceM: Number.NaN, smoothedDistanceM: 1, referenceDistanceM: 1 }],
      }),
    ];
    expect(getValidExperimentalRecords(records).map((record) => record.sessionId)).toEqual(["session-1"]);
    const csv = toCSV(
      getValidExperimentalRecords(records).map((record) => ({
        data_source: record.dataSource,
        participant_id: record.participantId,
      })),
      undefined,
      { "Data Source": "RECORDED" }
    );
    expect(csv).toContain("# Data Source: RECORDED");
    expect(csv).toContain("P01");
    expect(csv).not.toContain("SIMULATED");
  });

  it("keeps PO1-PO13 records out of additional distance results", () => {
    const records = [
      makeRecord({ participantId: "PO1" }),
      makeRecord({ sessionId: "legacy-participant", participantId: "P13" }),
      makeRecord({ sessionId: "additional", participantId: undefined }),
      makeRecord({ sessionId: "unknown-id", participantId: "P14" }),
    ];
    expect(getAdditionalDistanceRecords(records).map((record) => record.sessionId)).toEqual(["additional"]);
  });

  it("classifies pilot EMA variability by participant-level quartiles with moderate boundary handling", () => {
    expect(classifyParticipantEmaStability(0.4, 1.0, 2.0)).toBe("Low variability");
    expect(classifyParticipantEmaStability(1.0, 1.0, 2.0)).toBe("Medium variability");
    expect(classifyParticipantEmaStability(2.0, 1.0, 2.0)).toBe("Medium variability");
    expect(classifyParticipantEmaStability(3.0, 1.0, 2.0)).toBe("High variability");
  });

  it("aggregates participant-level EMA SD across eligible recordings and excludes invalid records from cohort calculations", () => {
    const makeSamples = (emaValues: number[]): TemporalDistanceSample[] =>
      emaValues.map((value, index) => ({
        timeSec: index,
        rawDistanceM: value + 0.05,
        smoothedDistanceM: value,
        referenceDistanceM: 1,
      }));

    const records: ValidationRecord[] = [
      makeRecord({
        sessionId: "po1-a",
        participantId: "P01",
        temporalSamples: makeSamples([1.0, 1.0, 1.0]),
      }),
      makeRecord({
        sessionId: "po1-b",
        participantId: "P01",
        temporalSamples: makeSamples([1.0, 1.0, 1.0]),
      }),
      makeRecord({
        sessionId: "po2",
        participantId: "PO2",
        temporalSamples: makeSamples([1.0, 1.04, 1.08]),
      }),
      makeRecord({
        sessionId: "po3",
        participantId: "PO3",
        temporalSamples: makeSamples([1.0, 1.2, 1.4]),
      }),
      makeRecord({
        sessionId: "simulated",
        participantId: "PO4",
        dataSource: "SIMULATED",
        recordingStatus: "VALID",
        temporalSamples: makeSamples([1.0, 1.0, 1.0]),
      }),
      makeRecord({
        sessionId: "invalid",
        participantId: "P05",
        recordingStatus: "TRACKING_LOST",
        temporalSamples: makeSamples([1.0, 1.1, 1.2]),
      }),
    ];

    const summary = calculatePilotEmaStabilityClassification(records);
    expect(summary.includedParticipantCount).toBe(3);
    expect(summary.q1Cm).not.toBeNull();
    expect(summary.medianCm).not.toBeNull();
    expect(summary.q3Cm).not.toBeNull();
    expect(summary.q1Cm).toBeCloseTo(2, 5);
    expect(summary.q3Cm).toBeCloseTo(12, 5);
    expect(summary.q1Cm).toBeLessThanOrEqual(summary.medianCm ?? Number.POSITIVE_INFINITY);
    expect(summary.medianCm).toBeLessThanOrEqual(summary.q3Cm ?? Number.POSITIVE_INFINITY);
    expect(summary.participantSummaries.find((row) => row.participantId === "PO1")?.eligibleRecordingCount).toBe(2);
    expect(summary.participantSummaries.find((row) => row.participantId === "PO1")?.participantEmaSdCm).toBe(0);
    expect(summary.participantSummaries.find((row) => row.participantId === "PO1")?.variabilityClassification).toBe("Low variability");
    expect(summary.participantSummaries.find((row) => row.participantId === "PO2")?.variabilityClassification).toBe("Medium variability");
    expect(summary.participantSummaries.find((row) => row.participantId === "PO3")?.variabilityClassification).toBe("High variability");
    expect(summary.participantSummaries.find((row) => row.participantId === "PO4")?.dataStatus).toBe("Awaiting eligible data");
  });

  it("keeps missing participants unavailable and normalizes legacy IDs consistently", () => {
    const summary = calculatePilotEmaStabilityClassification([
      makeRecord({ sessionId: "po1", participantId: "P01", temporalSamples: samples }),
      makeRecord({ sessionId: "po13", participantId: "P13", temporalSamples: samples }),
    ]);

    expect(summary.participantSummaries.find((row) => row.participantId === "PO1")?.participantEmaSdCm).not.toBeNull();
    expect(summary.participantSummaries.find((row) => row.participantId === "PO2")?.dataStatus).toBe("Awaiting eligible data");
    expect(summary.participantSummaries.find((row) => row.participantId === "PO2")?.variabilityClassification).toBeNull();
  });

  it("withholds pilot thresholds until at least two eligible participants are available", () => {
    const oneParticipantSummary = calculatePilotEmaStabilityClassification([
      makeRecord({ participantId: "PO1" }),
    ]);
    expect(oneParticipantSummary.includedParticipantCount).toBe(1);
    expect(oneParticipantSummary.hasSufficientData).toBe(false);
    expect(oneParticipantSummary.q1Cm).toBeNull();
    expect(oneParticipantSummary.q3Cm).toBeNull();
    expect(oneParticipantSummary.participantSummaries.find((row) => row.participantId === "PO1")?.variabilityClassification).toBeNull();

    const emptySummary = calculatePilotEmaStabilityClassification([]);
    expect(emptySummary.includedParticipantCount).toBe(0);
    expect(emptySummary.hasSufficientData).toBe(false);
    expect(emptySummary.q1Cm).toBeNull();
    expect(emptySummary.q3Cm).toBeNull();
    expect(calculateQuartile([Number.NaN, Number.POSITIVE_INFINITY], 0.25)).toBeNull();
  });

  it("classifies an unlinked new-user recording against pilot thresholds without including it in the pilot", () => {
    const makeSamples = (values: number[]): TemporalDistanceSample[] =>
      values.map((value, index) => ({
        timeSec: index,
        rawDistanceM: value + 0.05,
        smoothedDistanceM: value,
        referenceDistanceM: 1,
      }));
    const pilotRecords = [
      makeRecord({ sessionId: "pilot-1", participantId: "PO1", temporalSamples: makeSamples([1, 1, 1]) }),
      makeRecord({ sessionId: "pilot-2", participantId: "PO2", temporalSamples: makeSamples([1, 1.04, 1.08]) }),
      makeRecord({ sessionId: "pilot-3", participantId: "PO3", temporalSamples: makeSamples([1, 1.2, 1.4]) }),
    ];
    const pilotSummary = calculatePilotEmaStabilityClassification(pilotRecords);
    const newUser = makeRecord({
      sessionId: "new-user",
      participantId: undefined,
      temporalSamples: makeSamples([1, 1.01, 1.02]),
    });

    const result = classifyNewUserEmaRecording(newUser, pilotSummary);
    expect(result?.emaSdCm).toBeCloseTo(1, 5);
    expect(result?.q1Cm).toBeCloseTo(2, 5);
    expect(result?.q3Cm).toBeCloseTo(12, 5);
    expect(result?.classification).toBe("Low variability");
    expect(calculatePilotEmaStabilityClassification([...pilotRecords, newUser]).includedParticipantCount).toBe(3);
  });

  it("returns the new-user SD but no category when pilot thresholds are unavailable", () => {
    const pilotSummary = calculatePilotEmaStabilityClassification([
      makeRecord({ participantId: "PO1" }),
    ]);
    const result = classifyNewUserEmaRecording(
      makeRecord({ participantId: undefined, temporalSamples: samples }),
      pilotSummary
    );
    expect(result?.emaSdCm).toBeGreaterThan(0);
    expect(result?.classification).toBeNull();
    expect(result?.q1Cm).toBeNull();
    expect(result?.q3Cm).toBeNull();
  });

  it("does not classify invalid, participant-linked, or non-recorded new-user attempts", () => {
    const pilotSummary = calculatePilotEmaStabilityClassification([
      makeRecord({ sessionId: "pilot-1", participantId: "PO1" }),
      makeRecord({ sessionId: "pilot-2", participantId: "PO2", temporalSamples: [
        { timeSec: 0, rawDistanceM: 1, smoothedDistanceM: 1.1, referenceDistanceM: 1 },
        { timeSec: 1, rawDistanceM: 1.1, smoothedDistanceM: 1.2, referenceDistanceM: 1 },
      ] }),
    ]);
    const validNewUser = makeRecord({ participantId: undefined });

    expect(classifyNewUserEmaRecording(null, pilotSummary)).toBeNull();
    expect(classifyNewUserEmaRecording(
      { ...validNewUser, recordingStatus: "TRACKING_LOST" },
      pilotSummary
    )).toBeNull();
    expect(classifyNewUserEmaRecording(
      { ...validNewUser, participantId: "PO3" },
      pilotSummary
    )).toBeNull();
    expect(classifyNewUserEmaRecording(
      { ...validNewUser, dataSource: "SIMULATED" },
      pilotSummary
    )).toBeNull();
    expect(classifyNewUserEmaRecording(
      { ...validNewUser, dataSource: undefined },
      pilotSummary
    )).toBeNull();
    expect(classifyNewUserEmaRecording(
      { ...validNewUser, temporalSamples: samples.slice(0, 1) },
      pilotSummary
    )).toBeNull();
  });

  it("prevents duplicate valid participant-distance-repetition slots and reports protocol progress", () => {
    const records = [makeRecord({ participantId: "P01" })];
    expect(isDuplicateValidRecording(records, "PO1", 1, 1)).toBe(true);
    expect(isDuplicateValidRecording(records, "P01", 2, 1)).toBe(false);
    const completion = getStudyCompletion(records, [1], 1);
    expect(completion.planned).toBe(13);
    expect(completion.completed).toBe(1);
    expect(completion.missingCombinations).toContain("PO2 / 1 m / rep 1");
  });
});
