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

export interface TemporalDistanceSample {
  timeSec: number;
  timestamp?: string;
  rawDistanceM: number;
  smoothedDistanceM: number;
  referenceDistanceM: number;
  ipdPixels?: number;
  confidence?: number;
  headYawDeg?: number;
  headPitchDeg?: number;
}

/**
 * Generate a reproducible benchmark dataset of temporal webcam distance tracking,
 * comparing raw IPD estimates against EMA smoothed values (alpha=0.20) and a reference distance.
 */
export function generateDemoTemporalSeries(
  referenceDistanceM = 1.50,
  durationSec = 3.0,
  fps = 30,
  alpha = CONFIG.defaultSmoothingAlpha
): TemporalDistanceSample[] {
  const totalFrames = Math.round(durationSec * fps);
  const dt = 1 / fps;
  const smoother = new DistanceSmoother(alpha);
  const samples: TemporalDistanceSample[] = [];

  // Deterministic seed pattern so repeated benchmark runs produce matching reproducible paper plots
  for (let i = 0; i < totalFrames; i++) {
    const timeSec = Number((i * dt).toFixed(3));
    
    // Natural head micro-movement drift + webcam sensor pixel noise
    const drift = Math.sin((i / totalFrames) * Math.PI * 2) * 0.015;
    const noise = Math.sin(i * 1.7) * 0.022 + Math.cos(i * 2.3) * 0.018;

    // Simulate 2 transient single-frame landmark tracking spikes (outliers)
    let spike = 0;
    if (i === 24) spike = 0.075; // single-frame landmark jump up
    if (i === 62) spike = -0.068; // single-frame landmark jump down

    const rawDistanceM = Number((referenceDistanceM + drift + noise + spike).toFixed(4));
    const smoothRes = smoother.push(rawDistanceM);

    samples.push({
      timeSec,
      rawDistanceM,
      smoothedDistanceM: Number(smoothRes.smoothed.toFixed(4)),
      referenceDistanceM,
    });
  }

  return samples;
}
