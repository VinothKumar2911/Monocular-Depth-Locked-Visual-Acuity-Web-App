import { Link } from "react-router-dom";
import { preloadRoute } from "../routePreload";
import DetailTile from "../components/DetailTile";
import WorkflowStep from "../components/WorkflowStep";

export default function Home() {
  return (
    <div className="page wide home-page">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Depth-aware vision lab</div>
          <h1>Visual acuity, measured at your actual viewing distance.</h1>
          <p className="subtitle">
            A webcam-guided research workflow that keeps the optotype's visual angle consistent as you move.
          </p>
          <div className="btn-row">
            <Link
              className="btn btn-primary btn-lg"
              to="/camera-setup"
              onMouseEnter={() => preloadRoute("/camera-setup")}
              onFocus={() => preloadRoute("/camera-setup")}
            >
              Start a test <span aria-hidden="true">-&gt;</span>
            </Link>
            <Link
              className="btn btn-secondary btn-lg"
              to="/calibration"
              onMouseEnter={() => preloadRoute("/calibration")}
              onFocus={() => preloadRoute("/calibration")}
            >
              Review calibration
            </Link>
          </div>
        </div>
        <div className="hero-signal" aria-label="Measurement overview">
          <div className="signal-ring signal-ring-outer" />
          <div className="signal-ring signal-ring-inner" />
          <div className="signal-core">VA</div>
          <div className="signal-caption">controlled visual angle</div>
        </div>
      </section>

      <section className="session-strip" aria-label="Session overview">
        <div>
          <div className="stat-label">Session profile</div>
          <strong>Monocular depth-locked assessment</strong>
        </div>
        <div className="session-fact"><span className="status-dot" /> Camera tracking required</div>
        <div className="session-fact">Typical setup: 2-3 min</div>
        <Link className="text-link" to="/about" onMouseEnter={() => preloadRoute("/about")} onFocus={() => preloadRoute("/about")}>
          Read about the method -&gt;
        </Link>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">The workflow</div>
            <h2>From camera check to result</h2>
          </div>
          <span className="muted small">One continuous session</span>
        </div>
        <div className="workflow-grid">
          <WorkflowStep number="01" title="Camera setup" detail="Grant access and confirm your face and eyes are being tracked." to="/camera-setup" action="Begin" />
          <WorkflowStep number="02" title="Calibration" detail="Pair camera geometry with the physical size of your display." to="/calibration" action="Configure" />
          <WorkflowStep number="03" title="Acuity test" detail="Answer tumbling E prompts while distance-aware sizing adapts." to="/test" action="Preview" />
          <WorkflowStep number="04" title="Results" detail="Review the staircase estimate and the measurements behind it." to="/results" action="Review" />
        </div>
      </section>

      <section className="detail-grid home-section" aria-label="Measurement details">
        <DetailTile eyebrow="Distance signal" title="Monocular depth" detail="Eye landmarks and head pose estimate how far you are from the display." />
        <DetailTile eyebrow="Optotype control" title="Stable visual angle" detail="The Tumbling E is resized from the estimated distance and screen calibration." />
        <DetailTile eyebrow="Research record" title="Transparent results" detail="Keep the raw distance, smoothed signal, and staircase behavior visible." />
      </section>

      <div className="home-footer-row">
        <p className="disclaimer">Research prototype. Not a substitute for a professional eye examination.</p>
        <Link className="text-link" to="/validation" onMouseEnter={() => preloadRoute("/validation")} onFocus={() => preloadRoute("/validation")}>
          Open validation mode -&gt;
        </Link>
      </div>
    </div>
  );
}
