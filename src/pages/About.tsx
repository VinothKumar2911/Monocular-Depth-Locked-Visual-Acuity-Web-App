export default function About() {
  return (
    <div className="page narrow">
      <h2>About This Project</h2>

      <div className="card">
        <h3>Monocular</h3>
        <p className="muted">One ordinary camera — no LiDAR, no ultrasonic sensor, no special hardware.</p>
      </div>
      <div className="card">
        <h3>Depth</h3>
        <p className="muted">Distance from the user's eyes to the camera/screen.</p>
      </div>
      <div className="card">
        <h3>Visual Acuity</h3>
        <p className="muted">Ability to see small visual details — traditionally measured with fixed-distance charts.</p>
      </div>

      <div className="card">
        <h3>Core Idea</h3>
        <p className="muted">
          Instead of forcing the user to sit at one fixed distance, the application continuously estimates
          viewing distance and changes the size of the visual optotype accordingly, so its visual angle stays
          approximately constant.
        </p>
        <pre className="mono small" style={{ background: "var(--surface-alt)", padding: 16, borderRadius: 10, overflowX: "auto" }}>
{`Webcam
   ↓
Face landmarks
   ↓
Eye distance
   ↓
Viewing distance
   ↓
Visual angle
   ↓
Optotype size`}
        </pre>
      </div>

      <div className="card">
        <h3>Research Question</h3>
        <p className="muted">
          Can a standard webcam, combined with facial landmark detection, interpupillary-distance-based
          geometry, calibration, and dynamic vector rendering, provide sufficiently accurate distance
          estimation for a reliable distance-adaptive visual-acuity test?
        </p>
      </div>

      <div className="card">
        <h3>Privacy</h3>
        <p className="muted">
          Camera video is processed locally in your browser and is not uploaded by this application. Only
          derived numerical data (distance, IPD, head pose, test responses) is stored, and only on your device.
        </p>
      </div>

      <div className="card">
        <h3>Limitations</h3>
        <ul className="muted small">
          <li>Webcam focal length and resolution differ by device.</li>
          <li>Lens distortion can affect measurements.</li>
          <li>IPD differs between people; the default 63mm is only a population average.</li>
          <li>Head rotation reduces the reliability of the pixel-IPD measurement.</li>
          <li>Lighting conditions affect landmark-detection quality.</li>
          <li>Camera-to-screen physical offset is not modeled by default (assumed 0).</li>
          <li>Browser rendering does not guarantee exact physical pixel dimensions without calibration.</li>
          <li>OS-level display scaling/zoom can affect screen calibration if changed afterward.</li>
          <li>Accuracy may degrade at longer distances.</li>
          <li>A ±3cm error target at 3m is a stringent research target, not a guarantee.</li>
          <li>This is a research prototype, not a clinical diagnostic instrument.</li>
        </ul>
      </div>
    </div>
  );
}
