/**
 * DirectionButtons.tsx
 * -----------------------------------------------------------------------
 * Four-way direction pad used to record the user's response to the
 * Tumbling E orientation.
 *
 * Rotation convention (must match TumblingE.tsx's SVG rotate() usage):
 *   0°   -> opening points RIGHT
 *   90°  -> opening points DOWN   (SVG rotate() is clockwise)
 *   180° -> opening points LEFT
 *   270° -> opening points UP
 */
import type { Orientation } from "../visionAcuity/staircase";

const ARROW_TO_ORIENTATION: Record<"up" | "down" | "left" | "right", Orientation> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270,
};

export default function DirectionButtons({ onAnswer, disabled }: { onAnswer: (o: Orientation) => void; disabled?: boolean }) {
  return (
    <div className="direction-pad" role="group" aria-label="Select the direction the E opens">
      <button className="up" disabled={disabled} onClick={() => onAnswer(ARROW_TO_ORIENTATION.up)} aria-label="Up">
        ↑
      </button>
      <button className="left" disabled={disabled} onClick={() => onAnswer(ARROW_TO_ORIENTATION.left)} aria-label="Left">
        ←
      </button>
      <button className="right" disabled={disabled} onClick={() => onAnswer(ARROW_TO_ORIENTATION.right)} aria-label="Right">
        →
      </button>
      <button className="down" disabled={disabled} onClick={() => onAnswer(ARROW_TO_ORIENTATION.down)} aria-label="Down">
        ↓
      </button>
    </div>
  );
}
