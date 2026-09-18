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
const DB_VERSION = 1;

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

export interface ValidationRecord {
  id?: number;
  sessionId: string;
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
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("trials")) {
          const store = db.createObjectStore("trials", { keyPath: "id", autoIncrement: true });
          store.createIndex("sessionId", "sessionId");
        }
        if (!db.objectStoreNames.contains("validation")) {
          const store = db.createObjectStore("validation", { keyPath: "id", autoIncrement: true });
          store.createIndex("sessionId", "sessionId");
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
