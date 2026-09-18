/**
 * CameraPreview.tsx
 * -----------------------------------------------------------------------
 * Renders the live <video> element from VisionContext plus a canvas
 * overlay drawing the detected eye points (useful for visually
 * confirming tracking quality during setup/calibration).
 */
import { useEffect, useRef } from "react";
import { useVision } from "../context/VisionContext";

export default function CameraPreview({ showOverlay = true }: { showOverlay?: boolean }) {
  const { videoRef, attachVideo, tracking } = useVision();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!showOverlay) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = tracking.videoWidth || video.videoWidth || 640;
    canvas.height = tracking.videoHeight || video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    if (tracking.eye) {
      ctx.fillStyle = "#3fd67e";
      for (const pt of [tracking.eye.leftEye, tracking.eye.rightEye]) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(63, 214, 126, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tracking.eye.leftEye.x, tracking.eye.leftEye.y);
      ctx.lineTo(tracking.eye.rightEye.x, tracking.eye.rightEye.y);
      ctx.stroke();
    }
  }, [tracking, showOverlay, videoRef]);

  return (
    <div className="camera-wrap">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={attachVideo} muted playsInline autoPlay />
      {showOverlay && <canvas ref={canvasRef} />}
    </div>
  );
}
