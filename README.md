# Monocular Depth-Locked Visual Acuity

A research prototype investigating whether a normal 2D webcam — no LiDAR, no ultrasonic sensor, no special
hardware — can estimate a user's viewing distance accurately enough to power a **distance-adaptive visual
acuity test**, where a Tumbling E optotype dynamically resizes as the user moves so that its angular size
stays approximately constant.

> **This is a research prototype. It is not a clinical diagnostic tool and does not replace a professional
> eye examination.**

---

## Table of Contents

- [Project Overview](#project-overview)
- [Research Problem](#research-problem)
- [Research Question](#research-question)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Application Walkthrough](#application-walkthrough)
- [Camera Requirements](#camera-requirements)
- [Screen Calibration](#screen-calibration)
- [Camera Calibration](#camera-calibration)
- [Distance Estimation Mathematics](#distance-estimation-mathematics)
- [Visual Angle Mathematics](#visual-angle-mathematics)
- [Tumbling E Geometry](#tumbling-e-geometry)
- [Visual Acuity Test Algorithm](#visual-acuity-test-algorithm)
- [Validation Procedure](#validation-procedure)
- [Metrics](#metrics)
- [Unit Tests](#unit-tests)
- [Limitations](#limitations)
- [Privacy](#privacy)
- [Future Work](#future-work)

---

## Project Overview

Traditional visual-acuity charts (Snellen, logMAR) assume the patient sits at one fixed, known distance —
typically 3m or 6m (or 20ft/10ft in imperial charts). This application instead:

1. Watches the user through their webcam.
2. Detects the face and eyes with **MediaPipe Face Landmarker**.
3. Estimates the camera-to-eye distance from the pixel interpupillary distance (IPD) using a calibrated
   pinhole-camera model.
4. Calculates the physical optotype size required to subtend a fixed **5 arcminute** visual angle (the
   standard 20/20-equivalent target) at that distance.
5. Converts that physical size into screen pixels using a **physical screen calibration**.
6. Renders a geometrically-correct SVG Tumbling E at that size, and keeps resizing it as the user moves.
7. Runs a simple adaptive logMAR staircase to produce an experimental visual-acuity estimate.
8. Provides a dedicated **Validation / Research Mode** to compare estimated vs. actual (tape/laser-measured)
   distance, with honest, non-fabricated PASS/FAIL reporting against a ±3cm research target.

## Research Problem

Fixed-distance acuity testing is a usability constraint, not a physiological requirement — what actually
matters is the *visual angle* subtended by the optotype at the eye. If viewing distance can be estimated
reliably from an ordinary webcam, the optotype can be resized in real time so acuity testing remains valid at
any comfortable distance the user chooses (within camera/tracking range).

## Research Question

> Can a standard webcam, combined with facial landmark detection, interpupillary-distance-based geometry,
> calibration, and dynamic vector rendering, provide sufficiently accurate distance estimation for a reliable
> distance-adaptive visual-acuity test?

This prototype does not assume the answer. The Validation Mode is built specifically to let you measure it,
and to report the true result — including failure — rather than a hard-coded pass.

## System Architecture

```
WEBCAM
  ↓
Camera Permission
  ↓
Video Stream
  ↓
MediaPipe Face Landmarker
  ↓
Face + Eye (Iris) Landmarks
  ↓
Pixel Interpupillary Distance (IPD)
  ↓
Camera Calibration (focal length)
  ↓
Distance Estimation (pinhole model)
  ↓
Distance Smoothing (EMA + outlier rejection)
  ↓
Eye-to-Screen Distance
  ↓
Visual Angle Calculation (5 arcmin target)
  ↓
Required Physical Optotype Height (mm)
  ↓
Screen Calibration (px/mm)
  ↓
Required Optotype Pixel Height
  ↓
SVG Tumbling E
  ↓
User Identifies E Direction
  ↓
Adaptive logMAR Staircase
  ↓
Final VA Result + Validation / Export
```

### File structure

```
src/
  components/       Reusable UI: TumblingE, CameraPreview, FaceStatus, DebugPanel,
                     CalibrationCard, DirectionButtons, DistanceDisplay, TopNav
  pages/            Home, CameraSetup, Calibration, VisualAcuityTest, Results,
                     Validation, About
  vision/           faceLandmarker, eyeTracking, headPose, distanceEstimator,
                     distanceSmoothing, monocularDepth (optional/experimental)
  calibration/       cameraCalibration, screenCalibration, calibrationStorage
  visionAcuity/      visualAngle, optotypeSizing, staircase, scoring
  context/           VisionContext — owns the webcam stream + inference loop
  utils/             math, csvExport, storage (IndexedDB via `idb`)
  config.ts          All tunable constants in one place — no scattered magic numbers
  __tests__/         Vitest unit tests for the math/pipeline
```

## Technology Stack

- React 19 + Vite + TypeScript
- `@mediapipe/tasks-vision` — Face Landmarker (face + iris landmarks, on-device)
- SVG for optotype rendering (via React components)
- `react-router-dom` (HashRouter, so it works from a `file://`-style static deploy too)
- `recharts` for the distance/optotype-size-over-time charts
- `idb` (IndexedDB) for trial/validation logs; `localStorage` for calibration
- `vite-plugin-pwa` for installability + offline app shell
- `vitest` for unit tests

## Installation

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`) in a modern browser. **Webcam access
requires a secure context** — `localhost` works out of the box; a deployed build needs HTTPS.

Other scripts:

```bash
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the production build locally
npm run test      # run the unit test suite (vitest)
```

## Application Walkthrough

```
Home → Camera Setup → Allow Camera → Face Detection →
Camera Calibration → Screen Calibration → Calibration Complete →
Visual Acuity Test → Fullscreen → Tumbling E appears →
User answers direction → Distance continuously tracked →
E dynamically resizes → Adaptive staircase continues →
Test finishes → Results → Optional Validation → Export Data
```

The **Test screen** is intentionally minimal — just the E and the four direction buttons — with no menus,
debug info, or animation, to avoid distracting or biasing the user. A "Show Research Debug Data" toggle in
the corner reveals the live pipeline internals for demos/debugging without cluttering the default view.

## Camera Requirements

- Any built-in or USB webcam supported by `getUserMedia`.
- The app requests `1280×720` as an *ideal* resolution but does not assume it was granted — actual resolution
  is read back from the video track and shown on the Camera Setup page.
- No LiDAR, depth camera, or ultrasonic sensor is used or required.

## Screen Calibration

Browsers do not guarantee that 1 CSS pixel equals 1 physical pixel — this varies with monitor PPI, OS display
scaling, and browser zoom. The Calibration page shows an adjustable bar; hold a physical ruler against the
screen and drag the slider until the bar matches your chosen reference size (default 50mm). The app then
computes:

```
pixelsPerMM = displayedPixels / physicalSizeMM
```

This factor is required before any optotype can be rendered at a physically meaningful size, and the test
will not start until it (and camera calibration) are complete.

**Re-calibrate if you change your OS display scaling/zoom after calibrating.**

## Camera Calibration

Two IPD modes are supported (`src/vision/distanceEstimator.ts`):

- **Mode A — Personal calibration (recommended):** sit at 1–3 known distances (defaults: 1.50m, 2.20m, 3.00m);
  the app captures a stable pixel-IPD sample at each and solves for the camera's effective focal length:
  ```
  f = D × w / W
  ```
  where `D` is the known distance, `w` the measured pixel IPD, and `W` your real-world IPD (enter your own if
  known, or use the 63mm population-average default).
- **Mode B — Statistical:** skip personal calibration and rely on the default assumed IPD. This is clearly
  labeled as an assumption everywhere it's used, and is not appropriate for reporting validation results.

Multiple calibration points are averaged (a simple mean of the per-point solved focal lengths) for a more
robust estimate than a single point.

The camera-to-screen physical offset (webcam above/below/embedded in the display) is currently modeled as a
configurable-but-defaulted-to-zero parameter (`cameraOffsetMM`) — see [Limitations](#limitations).

## Distance Estimation Mathematics

**Pixel IPD:**
```
IPD_px = sqrt((x_right - x_left)^2 + (y_right - y_left)^2)
```
computed from MediaPipe's iris-center landmarks (indices 468 / 473 in the 478-point refined face mesh — see
`src/vision/eyeTracking.ts` for the full landmark documentation and corner-landmark fallback).

**Pinhole camera distance model:**
```
D = f * W / w
```
- `D` = estimated distance
- `f` = effective focal length (px), from camera calibration
- `W` = assumed/calibrated real-world IPD (mm)
- `w` = measured pixel IPD

**Distance smoothing:** an exponential moving average (configurable `alpha`, default 0.2) with a simple
median-based outlier rejection step, so a single noisy frame can't cause a visible optotype jump:
```
smoothed = alpha * current + (1 - alpha) * previous
```

## Visual Angle Mathematics

**Required physical optotype height** for a target visual angle (default 5 arcminutes, the standard
20/20-equivalent target), using the exact symmetric formula (not the small-angle approximation):
```
theta = 5 * pi / (180 * 60)      (5 arcmin, in radians)
H = 2 * D * tan(theta / 2)
```

**Actual visual angle** subtended by a rendered optotype (used for verification in Validation Mode):
```
theta = 2 * atan( (H/2) / D )
```

**Screen pixel conversion:**
```
H_px = H_mm * pixelsPerMM
```

Worked examples (programmatically computed, unit-tested against these exact figures):

| Distance | Optotype height |
|---------:|-----------------:|
| 1.50 m   | ~2.18 mm |
| 2.20 m   | ~3.20 mm |
| 3.00 m   | ~4.36 mm |

## Tumbling E Geometry

`TumblingE.tsx` renders a proper geometric optotype on a 5x5 grid — not a text "E" glyph:
- Total height = the calculated physical target height (in px).
- Stroke width = 1/5 of total height.
- Constructed from 3 horizontal bars + 1 vertical spine, then rotated via SVG `transform` for the 4
  orientations (0°/90°/180°/270°, mapped to right/down/left/up — see the doc comment in `DirectionButtons.tsx`
  for the exact convention).

## Visual Acuity Test Algorithm

A simple 1-up/1-down adaptive logMAR staircase (`src/visionAcuity/staircase.ts`):
- Starts at logMAR 0.3 (~20/40).
- Correct response leads to a decrease in logMAR by 0.1 (smaller/harder).
- Incorrect response leads to an increase in logMAR by 0.1 (larger/easier).
- Terminates after 6 reversals, or a 40-trial hard cap.
- Orientation is randomized each trial, never repeating the immediately previous orientation.
- Final score = mean logMAR of the last (up to) 6 trials, converted to a Snellen-style "20/X" string.

This is intentionally a simple procedure appropriate for a prototype — **not** a validated clinical staircase
(PEST/QUEST) — and is always labeled **"Experimental visual-acuity estimate"** in the UI.

## Validation Procedure

The Validation / Research Mode page lets you:
1. Enter the actual distance you measured with a tape measure or laser distance meter.
2. Sit at that distance and record ~3 seconds of live distance estimates.
3. The app computes the mean estimate, absolute error, and percentage error for that point, and marks
   PASS/FAIL against the configurable ±3cm target (`CONFIG.targetDistanceToleranceM`).
4. Repeat at multiple distances (defaults suggested: 1.50m, 2.20m, 3.00m) to build a validation table.
5. Optionally enter a caliper/ruler-measured physical optotype size to cross-check the rendered-size math.
6. Export the full validation log as CSV or JSON.

**No validation numbers are ever hard-coded or fabricated.** If your setup can't hit +/-3cm — which is a
genuinely stringent target, especially at 3m — the app will show FAIL and say so. That is itself a valid,
useful research result.

## Metrics

Computed in `src/utils/math.ts` and displayed in Validation Mode:

- **Absolute Error:** `|estimated - actual|`
- **Mean Absolute Error (MAE):** `mean(|estimated_i - actual_i|)`
- **Root Mean Square Error (RMSE):** `sqrt(mean((estimated_i - actual_i)^2))`
- **Percentage Error:** `|estimated - actual| / actual * 100`
- **Max Error:** `max(|estimated_i - actual_i|)`
- **Distance stability:** standard deviation of distance samples while stationary

## Unit Tests

```bash
npm run test
```

Covers (see `src/__tests__/`):
- Visual angle <-> optotype height conversion, matched against the worked examples above.
- Pinhole distance / focal-length calibration round-trip.
- Screen calibration px/mm conversion round-trip.
- Adaptive staircase direction, reversal counting, and termination.
- Orientation randomization (no immediate repeats).
- Distance smoothing convergence and single-frame outlier dampening.
- Validation error metrics (MAE, RMSE, absolute/percentage error).

## Limitations

1. Webcam focal length and field of view differ by device — personal calibration is strongly recommended over
   the statistical default.
2. Camera resolution and quality vary; low-light conditions degrade landmark-detection accuracy.
3. Lens distortion is not modeled or corrected.
4. Real IPD varies between individuals (~54-74mm); the 63mm default is only a population average.
5. Head rotation reduces the reliability of the pixel-IPD measurement — the app flags this via live
   yaw/pitch/roll estimation and warns the user, but does not fully correct for it.
6. Camera-to-screen physical offset (e.g. an external webcam mounted away from the screen) is not modeled by
   default (assumed 0, appropriate for a typical built-in laptop webcam).
7. Browser rendering does not guarantee exact physical pixel dimensions without the manual screen-calibration
   step — and that calibration becomes stale if OS display scaling changes afterward.
8. Distance-estimation accuracy is expected to degrade at longer distances (error scales with distance in a
   pinhole model with fixed pixel-measurement noise).
9. A +/-3cm error target at 3m is a stringent research target, not a guarantee — the Validation page will
   report the true result either way.
10. This is a research prototype, not a clinical diagnostic instrument, and does not replace a professional
    eye examination.

## Privacy

- Camera video is processed **entirely locally in the browser**. No frames or images are uploaded anywhere.
- Only derived numerical data is persisted (distance, pixel IPD, head pose, confidence, test responses,
  validation records) — all in `localStorage`/`IndexedDB` on the user's own device.
- See the in-app notice on the Camera Setup and About pages.

## Future Work

- **Optional AI monocular-depth comparison** (`src/vision/monocularDepth.ts`): the interface is defined and
  wired into a "Research Comparison Mode" concept, but no model is bundled by default — the core pipeline
  intentionally does not depend on a large depth model. A contributor can implement
  `runMonocularDepthEstimate()` against a TF.js/ONNX model (Depth Anything, ZoeDepth, Metric3D, etc.) without
  touching any other file.
- Camera-to-screen offset modeling for external/non-integrated webcams.
- Lens-distortion correction.
- A more rigorous adaptive procedure (e.g. QUEST/PEST) for the acuity staircase.
- Multi-point regression (rather than simple averaging) for camera calibration with >2 points.
