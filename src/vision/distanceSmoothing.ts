/**
 * distanceSmoothing.ts
 * -----------------------------------------------------------------------
 * Stateful smoothing helpers for noisy per-frame distance measurements.
 * The primary method is an exponential moving average (EMA); a moving
 * median over a short window is also provided as an alternative/adjunct
 * (useful for rejecting single-frame outliers before EMA is applied).
 */
import { CONFIG } from "../config";
import { emaStep, median, stdDev } from "../utils/math";

export class DistanceSmoother {
  private alpha: number;
  private smoothedValue: number | null = null;
  private recentRawValues: number[] = [];
  private readonly windowSize: number;

  constructor(alpha: number = CONFIG.defaultSmoothingAlpha, windowSize = 15) {
    this.alpha = alpha;
    this.windowSize = windowSize;
  }

  setAlpha(alpha: number): void {
    this.alpha = alpha;
  }

  reset(): void {
    this.smoothedValue = null;
    this.recentRawValues = [];
  }

  /**
   * Feed a new raw distance sample (meters). Returns the updated smoothed
   * value plus supporting diagnostics (raw median, variance/stddev over
   * the recent window).
   */
  push(rawDistanceM: number): {
    raw: number;
    smoothed: number;
    windowMedian: number;
    windowStdDev: number;
  } {
    this.recentRawValues.push(rawDistanceM);
    if (this.recentRawValues.length > this.windowSize) {
      this.recentRawValues.shift();
    }

    const windowMedian = median(this.recentRawValues);
    const windowStdDev = stdDev(this.recentRawValues);

    // Reject single-frame outliers more than 4 stddev from the window
    // median (only once we have enough samples to trust the stats).
    let sampleForEMA = rawDistanceM;
    if (this.recentRawValues.length >= 5 && windowStdDev > 0) {
      const deviations = Math.abs(rawDistanceM - windowMedian) / windowStdDev;
      if (deviations > 4) {
        sampleForEMA = windowMedian;
      }
    }

    this.smoothedValue = this.smoothedValue === null ? sampleForEMA : emaStep(sampleForEMA, this.smoothedValue, this.alpha);

    return {
      raw: rawDistanceM,
      smoothed: this.smoothedValue,
      windowMedian,
      windowStdDev,
    };
  }

  get current(): number | null {
    return this.smoothedValue;
  }
}
