/**
 * calibrationStorage.ts
 * -----------------------------------------------------------------------
 * Save/load helpers for camera + screen calibration, backed by
 * localStorage (see utils/storage.ts). Small, synchronous, and rarely
 * written, so localStorage is a fine fit (vs. IndexedDB for trial logs).
 */
import { LS_KEYS, loadJSON, saveJSON, removeKey } from "../utils/storage";
import type { CameraCalibration } from "./cameraCalibration";
import type { ScreenCalibration } from "./screenCalibration";

export function saveCameraCalibration(cal: CameraCalibration): void {
  saveJSON(LS_KEYS.cameraCalibration, cal);
}

export function loadCameraCalibration(): CameraCalibration | null {
  return loadJSON<CameraCalibration>(LS_KEYS.cameraCalibration);
}

export function clearCameraCalibration(): void {
  removeKey(LS_KEYS.cameraCalibration);
}

export function saveScreenCalibration(cal: ScreenCalibration): void {
  saveJSON(LS_KEYS.screenCalibration, cal);
}

export function loadScreenCalibration(): ScreenCalibration | null {
  return loadJSON<ScreenCalibration>(LS_KEYS.screenCalibration);
}

export function clearScreenCalibration(): void {
  removeKey(LS_KEYS.screenCalibration);
}

export function isFullyCalibrated(): boolean {
  return loadCameraCalibration() !== null && loadScreenCalibration() !== null;
}
