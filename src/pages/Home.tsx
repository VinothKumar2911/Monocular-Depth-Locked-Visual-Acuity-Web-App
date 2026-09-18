import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="page narrow">
      <div className="hero">
        <h1>Monocular Depth-Locked Visual Acuity</h1>
        <p className="subtitle">Webcam-based distance estimation and dynamically scaled visual acuity testing</p>
        <p className="explainer">
          This application uses your webcam to estimate your viewing distance and dynamically adjusts the
          visual acuity optotype so that it maintains a controlled visual angle as you move closer or
          farther from the screen.
        </p>

        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary btn-lg" to="/camera-setup">
            Start Visual Acuity Test
          </Link>
          <Link className="btn btn-secondary btn-lg" to="/calibration">
            Calibration
          </Link>
        </div>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 12 }}>
          <Link className="btn btn-secondary" to="/validation">
            Validation / Research Mode
          </Link>
          <Link className="btn btn-secondary" to="/about">
            About Project
          </Link>
        </div>

        <p className="disclaimer">
          This is a research prototype and is not intended to replace a professional eye examination.
        </p>
      </div>

      <div className="card-grid" style={{ marginTop: 12 }}>
        <div className="stat-card">
          <div className="stat-label">Step 1</div>
          <div style={{ fontWeight: 650 }}>Camera Setup</div>
          <div className="stat-sub">Grant camera access and confirm face/eye tracking.</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Step 2</div>
          <div style={{ fontWeight: 650 }}>Calibration</div>
          <div className="stat-sub">Calibrate the camera (distance geometry) and screen (physical pixel size).</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Step 3</div>
          <div style={{ fontWeight: 650 }}>Visual Acuity Test</div>
          <div className="stat-sub">A single Tumbling E, dynamically resized as you move.</div>
        </div>
      </div>
    </div>
  );
}
