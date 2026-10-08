/**
 * TumblingE.tsx
 * -----------------------------------------------------------------------
 * Renders a geometrically correct Tumbling E optotype as SVG (not a text
 * glyph). Standard optotype proportions: the E is inscribed in a 5x5
 * grid, with stroke width and gaps each equal to 1/5 of the total
 * height — this is the classic Snellen/logMAR optotype construction.
 */
import { useMemo } from "react";

export interface TumblingEProps {
  /** Total height of the optotype, in CSS pixels. */
  size: number;
  /** Orientation of the E's opening, in degrees (0 = opening right, matching a normal "E"). */
  rotation: 0 | 90 | 180 | 270;
  color?: string;
  /** Optional label for accessibility / debug overlays. */
  "aria-label"?: string;
}

export default function TumblingE({ size, rotation, color = "#08060d", ...rest }: TumblingEProps) {
  const s = Math.max(size, 1);
  const unit = s / 5; // 1/5th grid unit: stroke width & gap size

  // Build the E out of 3 horizontal bars + 1 vertical spine, all on a
  // 5x5 grid, pointing right (0deg) by construction, then rotated via SVG
  // transform for other orientations.
  const bars = useMemo(() => {
    const spine = { x: 0, y: 0, w: unit, h: s };
    const top = { x: 0, y: 0, w: s, h: unit };
    const middle = { x: 0, y: unit * 2, w: s, h: unit };
    const bottom = { x: 0, y: s - unit, w: s, h: unit };
    return [spine, top, middle, bottom];
  }, [s, unit]);

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      role="img"
      aria-label={rest["aria-label"] ?? `Tumbling E, opening ${rotation} degrees`}
      style={{ display: "block" }}
    >
      <g transform={`rotate(${rotation}, ${s / 2}, ${s / 2})`}>
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={color} />
        ))}
      </g>
    </svg>
  );
}
