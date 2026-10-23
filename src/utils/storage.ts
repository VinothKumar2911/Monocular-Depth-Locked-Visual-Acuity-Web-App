/**
 * storage.ts
 * -----------------------------------------------------------------------
 * Thin persistence layer. Calibration data (small) lives in localStorage
 * for simplicity and synchronous access. Trial-by-trial test/validation
 * logs (potentially larger, append-heavy) live in IndexedDB via `idb`.
 *
 * IMPORTANT (privacy): only derived numerical data is ever persisted here.
 * No video frames or images are stored — see PRIVACY notes in README.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "monocular-depth-va";
const DB_VERSION = 2;

export interface TrialRecord {
  id?: number;
  sessionId: string;
  trial: number;
  timestamp: string;
  distanceMeters: number;
  optotypeHeightMM: number;
  optotypePixels: number;
  orientation: 0 | 90 | 180 | 270;
  response: 0 | 90 | 180 | 270 | null;
  correct: boolean | null;
  reactionTimeMs: number | null;
  logMAR: number;
}

import type { TemporalDistanceSample } from "../vision/distanceSmoothing";

export interface ValidationRecord {
  id?: number;
  sessionId: string;
  participantId?: string; // Standardized participant ID (e.g. "P01".."P13")
  repetition?: number; // Repetition sequence number (e.g. 1, 2, 3)
  referenceDistanceUnit?: string; // Measurement unit (default "m")
  timestamp: string;
  actualDistanceM: number;
  estimatedDistanceM: number;
  absoluteErrorM: number;
  percentageError: number;
  ipdPixels: number;
  headYawDeg: number;
  headPitchDeg: number;
  confidence: number;
  targetOptotypeMM: number;
  renderedOptotypePX: number;
  measuredOptotypeMM: number | null;
  passFail: "PASS" | "FAIL";
  temporalSamples?: TemporalDistanceSample[];
  dataSource?: "RECORDED" | "SIMULATED";
  // Protocol & execution metadata
  emaAlpha?: number;
  cameraStatus?: string;
  durationSec?: number;
  sampleCount?: number;
  droppedSamplesCount?: number;
  // Precomputed recording stability statistics
  rawSdM?: number;
  smoothedSdM?: number;
  rawSdCm?: number;
  smoothedSdCm?: number;
  noiseReductionPct?: number | null;
  meanRawDistanceM?: number;
  meanRawErrorM?: number;
  meanEmaErrorM?: number;
  maxAbsoluteErrorM?: number;
  trackingFailures?: number;
  recordingStatus?: "VALID" | "INSUFFICIENT_SAMPLES" | "TRACKING_LOST" | "CANCELLED";
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("trials")) {
          const store = db.createObjectStore("trials", { keyPath: "id", autoIncrement: true });
          store.createIndex("sessionId", "sessionId");
        }
        if (!db.objectStoreNames.contains("validation")) {
          const store = db.createObjectStore("validation", { keyPath: "id", autoIncrement: true });
          store.createIndex("sessionId", "sessionId");
          store.createIndex("participantId", "participantId");
          store.createIndex("dataSource", "dataSource");
        } else {
          // Safe migration from v1 to v2: add indexes to existing validation store
          const store = transaction.objectStore("validation");
          if (!store.indexNames.contains("participantId")) {
            store.createIndex("participantId", "participantId");
          }
          if (!store.indexNames.contains("dataSource")) {
            store.createIndex("dataSource", "dataSource");
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function saveTrial(trial: TrialRecord): Promise<void> {
  const db = await getDB();
  await db.add("trials", trial);
}

export async function getTrialsForSession(sessionId: string): Promise<TrialRecord[]> {
  const db = await getDB();
  const all = (await db.getAllFromIndex("trials", "sessionId", sessionId)) as TrialRecord[];
  return all.sort((a, b) => a.trial - b.trial);
}

export async function saveValidationRecord(record: ValidationRecord): Promise<void> {
  const db = await getDB();
  await db.add("validation", record);
}

export async function getValidationRecords(sessionId?: string): Promise<ValidationRecord[]> {
  const db = await getDB();
  if (sessionId) {
    return (await db.getAllFromIndex("validation", "sessionId", sessionId)) as ValidationRecord[];
  }
  return (await db.getAll("validation")) as ValidationRecord[];
}

export async function getRealValidationRecords(): Promise<ValidationRecord[]> {
  const all = await getValidationRecords();
  return all.filter((r) => r.dataSource === "RECORDED");
}

export async function getValidationRecordsByParticipant(participantId: string): Promise<ValidationRecord[]> {
  const all = await getRealValidationRecords();
  return all.filter((r) => r.participantId === participantId);
}

export async function deleteValidationRecord(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("validation", id);
}

export async function clearValidationRecords(): Promise<void> {
  const db = await getDB();
  await db.clear("validation");
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear("trials");
  await db.clear("validation");
}

// ---- localStorage-backed calibration persistence ---------------------------

const LS_KEYS = {
  cameraCalibration: "mdva.cameraCalibration",
  screenCalibration: "mdva.screenCalibration",
  settings: "mdva.settings",
} as const;

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("Failed to persist to localStorage:", err);
  }
}

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error("Failed to read from localStorage:", err);
    return null;
  }
}

export function removeKey(key: string): void {
  localStorage.removeItem(key);
}

export { LS_KEYS };

