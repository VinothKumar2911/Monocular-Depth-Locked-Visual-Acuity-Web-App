/**
 * config.ts
 * -----------------------------------------------------------------------
 * Single source of truth for tunable constants used across the vision,
 * calibration, and visual-acuity-testing pipeline. Keeping these here
 * (instead of scattering magic numbers through components) makes the
 * research assumptions explicit and easy to audit / change.
 */

export const CONFIG = {
  // ---- Visual acuity / optotype geometry ----------------------------------
  /** Angular height (in arcminutes) of a 20/20-equivalent Tumbling E. */
  targetVisualAngleArcMin: 5,

  // ---- Interpupillary distance (IPD) ---------------------------------------
  /** Statistical fallback IPD (mm) used when no personal calibration exists.
   *  Adult human IPD typically ranges ~54-74mm; 63mm is a common population
   *  average used only as an explicitly-labeled assumption (Mode B). */
  defaultIPDmm: 63,

  // ---- Validation target ----------------------------------------------------
  /** Research target: estimated distance should ideally be within this many
   *  meters of the actual (measured) distance. */
  targetDistanceToleranceM: 0.03,

  // ---- Smoothing --------------------------------------------------------
  /** Exponential moving average weight applied to the newest raw sample.
   *  Higher = more responsive but noisier. Lower = smoother but laggier. */
  defaultSmoothingAlpha: 0.2,
  /** Minimum/maximum bounds a user may configure for the smoothing alpha. */
  minSmoothingAlpha: 0.05,
  maxSmoothingAlpha: 0.6,
  /** Number of consecutive good frames required before a distance
   *  measurement is treated as "trustworthy" for calibration purposes. */
  calibrationStableFrameCount: 20,
  /** Minimum change in distance (meters) required before the rendered
   *  optotype is resized, to avoid visible jitter from sensor noise. */
  distanceChangeThresholdM: 0.005,

  // ---- Head pose ------------------------------------------------------------
  /** Maximum tolerated yaw before distance estimates are flagged unreliable. */
  maxAllowedYawDeg: 10,
  /** Maximum tolerated pitch before distance estimates are flagged unreliable. */
  maxAllowedPitchDeg: 10,
  /** Maximum tolerated roll before distance estimates are flagged unreliable. */
  maxAllowedRollDeg: 15,

  // ---- Camera ---------------------------------------------------------------
  cameraIdealWidth: 1280,
  cameraIdealHeight: 720,
  cameraTargetFPS: 30,

  // ---- Test / staircase -------------------------------------------------
  /** Starting logMAR value (roughly 20/40). */
  startingLogMAR: 0.3,
  /** logMAR step size used by the simple staircase. */
  logMARStep: 0.1,
  /** Smallest logMAR the staircase will request (roughly 20/10). */
  minLogMAR: -0.3,
  /** Largest logMAR the staircase will request (roughly 20/200). */
  maxLogMAR: 1.0,
  /** Number of reversals before the staircase terminates. */
  requiredReversals: 6,
  /** Hard cap on number of trials, in case reversals are never reached. */
  maxTrials: 40,

  // ---- Standard reference distance for logMAR/Snellen conversion -------
  /** Reference distance (m) that a logMAR/Snellen chart is normally
   *  standardized to. We don't require the user to sit here — the whole
   *  point of this app is to remain valid at ANY distance — but VA
   *  notation (20/20, 6/6, logMAR) is still reported relative to this
   *  convention for readability. */
  referenceDistanceM: 6,
} as const;

export type AppConfig = typeof CONFIG;
