import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useVision } from "../context/VisionContext";
import CameraPreview from "../components/CameraPreview";
import FaceStatus from "../components/FaceStatus";

export default function CameraSetup() {
  const { cameraStatus, startCamera, stopCamera, tracking, modelError } = useVision();

  useEffect(() => {
    return () => {
      // Leave the camera running when navigating to Calibration/Test, so
      // we don't force the user to re-grant permission. Only stop on full
      // unmount of the app (handled inside VisionProvider itself).
    };
  }, []);

  return (
    <div className="page narrow">
      <div className="section-heading">
        <h2>Camera Setup</h2>
      </div>

      <p className="muted">Sit directly in front of the camera and keep your face approximately centered.</p>

      <div className="card">
        <CameraPreview />

        {cameraStatus === "idle" && (
          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-lg" onClick={startCamera}>
              Allow Camera Access
            </button>
          </div>
        )}

        {cameraStatus === "denied" && (
          <p className="instruction-banner">
            Camera permission is required for distance tracking. Please allow camera access in your browser's
            site settings and reload.
          </p>
        )}

        {cameraStatus === "unsupported" && (
          <p className="instruction-banner">
            No compatible camera was found, or your browser does not support webcam access. Please use a modern
            browser such as Chrome, Edge, Firefox, or Safari, and make sure a camera is connected.
          </p>
        )}

        {cameraStatus === "error" && (
          <p className="instruction-banner">
            Something went wrong starting the camera or vision model{modelError ? `: ${modelError}` : "."}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <FaceStatus />
        </div>

        {cameraStatus === "streaming" && (
          <p className="muted small" style={{ marginTop: 12 }}>
            Actual camera resolution: {tracking.videoWidth} × {tracking.videoHeight}px
          </p>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 20 }}>
        <Link
          className={`btn ${cameraStatus === "streaming" ? "btn-primary" : "btn-secondary"}`}
          to="/calibration"
          aria-disabled={cameraStatus !== "streaming"}
          onClick={(e) => {
            if (cameraStatus !== "streaming") e.preventDefault();
          }}
        >
          Continue to Calibration
        </Link>
        {cameraStatus === "streaming" && (
          <button className="btn btn-secondary" onClick={stopCamera}>
            Stop Camera
          </button>
        )}
      </div>
    </div>
  );
}
