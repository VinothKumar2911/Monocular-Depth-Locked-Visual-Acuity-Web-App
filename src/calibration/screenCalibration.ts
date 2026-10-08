/**
 * screenCalibration.ts
 * -----------------------------------------------------------------------
 * Converts a user-adjusted on-screen reference rectangle (measured
 * against a physical ruler) into a pixels-per-millimeter conversion
 * factor. Browsers do not guarantee 1 CSS px = 1 physical pixel (OS
 * display scaling, device pixel ratio, monitor PPI all vary), so this
 * step is mandatory before any optotype can be rendered at a physically
 * meaningful size.
 */

export interface ScreenCalibration {
  pixelsPerMM: number;
  referenceSizeMM: number;
  referenceSizePX: number;
  calibratedAt: string;
}
/**
 * pixelsPerMM = displayedPixels / physicalSizeMM
 */
export function computeScreenCalibration(displayedPX: number, physicalSizeMM: number): ScreenCalibration {
  return {
    pixelsPerMM: displayedPX / physicalSizeMM,
    referenceSizeMM: physicalSizeMM,
    referenceSizePX: displayedPX,
    calibratedAt: new Date().toISOString(),
  };
}

export function mmToPixels(mm: number, calibration: ScreenCalibration): number {
  return mm * calibration.pixelsPerMM;
}

export function pixelsToMM(px: number, calibration: ScreenCalibration): number {
  return px / calibration.pixelsPerMM;
}
