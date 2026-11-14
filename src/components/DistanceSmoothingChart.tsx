import { useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { CONFIG } from "../config";
import type { TemporalDistanceSample } from "../vision/distanceSmoothing";
import { downloadCSV } from "../utils/csvExport";
import { calculateNoiseReduction, sampleStdDev } from "../utils/math";

interface DistanceSmoothingChartProps {
  samples: TemporalDistanceSample[];
  title?: string;
  referenceDistanceM?: number;
  alpha?: number;
}

export default function DistanceSmoothingChart({
  samples,
  title = "Temporal Distance Estimation and EMA Smoothing",
  referenceDistanceM,
  alpha = CONFIG.defaultSmoothingAlpha,
}: DistanceSmoothingChartProps) {
  const [showTable, setShowTable] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!samples || samples.length === 0) {
    return (
      <div className="card-grid">
        <p className="muted">No temporal distance tracking data available yet.</p>
      </div>
    );
  }

  // Calculate stats
  const rawValues = samples.map((s) => s.rawDistanceM);
  const smoothedValues = samples.map((s) => s.smoothedDistanceM);
  const rawStdDevM = sampleStdDev(rawValues);
  const smoothedStdDevM = sampleStdDev(smoothedValues);
  const noiseReductionPct = calculateNoiseReduction(rawStdDevM, smoothedStdDevM);

  const refDist = referenceDistanceM ?? samples[0]?.referenceDistanceM ?? 1.5;

  // Domain for Y axis
  const allY = [...rawValues, ...smoothedValues, refDist];
  const minY = Math.floor((Math.min(...allY) - 0.05) * 50) / 50;
  const maxY = Math.ceil((Math.max(...allY) + 0.05) * 50) / 50;

  // Render high-res PNG canvas figure (distance_smoothing.png)
  const handleDownloadPNG = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0f172a"; // Sleek dark slate canvas background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header Card / Border
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

    // Title
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(title, 80, 110);

    // Subtitle & Formula
    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px sans-serif";
    ctx.fillText(
      `EMA Smoothing Pipeline (α = ${alpha})  |  D_t^{EMA} = α·D_t + (1-α)·D_{t-1}^{EMA}`,
      80,
      155
    );

    // Plot Area Dimensions
    const plotX = 140;
    const plotY = 220;
    const plotW = canvas.width - 240;
    const plotH = canvas.height - 340;

    // Plot background & grid
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(plotX, plotY, plotW, plotH);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;

    // Y Grid lines & ticks
    const yTickCount = 6;
    for (let i = 0; i <= yTickCount; i++) {
      const val = minY + (i / yTickCount) * (maxY - minY);
      const yPx = plotY + plotH - (i / yTickCount) * plotH;

      ctx.beginPath();
      ctx.moveTo(plotX, yPx);
      ctx.lineTo(plotX + plotW, yPx);
      ctx.stroke();

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "20px monospace";
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(2) + " m", plotX - 15, yPx + 6);
    }

    // X Grid lines & ticks
    const minX = samples[0].timeSec;
    const maxX = samples[samples.length - 1].timeSec;
    const xTickCount = 6;
    for (let i = 0; i <= xTickCount; i++) {
      const val = minX + (i / xTickCount) * (maxX - minX);
      const xPx = plotX + (i / xTickCount) * plotW;

      ctx.beginPath();
      ctx.moveTo(xPx, plotY);
      ctx.lineTo(xPx, plotY + plotH);
      ctx.stroke();

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "20px monospace";
      ctx.textAlign = "center";
      ctx.fillText(val.toFixed(1) + " s", xPx, plotY + plotH + 30);
    }

    // Axis titles
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Time (s)", plotX + plotW / 2, plotY + plotH + 75);

    ctx.save();
    ctx.translate(50, plotY + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Viewing Distance (m)", 0, 0);
    ctx.restore();

    // Helper map functions
    const mapX = (t: number) => plotX + ((t - minX) / (maxX - minX || 1)) * plotW;
    const mapY = (d: number) => plotY + plotH - ((d - minY) / (maxY - minY || 1)) * plotH;

    // 1. Reference Distance (D_ref) Dashed Line
    const refYPx = mapY(refDist);
    ctx.strokeStyle = "#f59e0b"; // Gold
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(plotX, refYPx);
    ctx.lineTo(plotX + plotW, refYPx);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // 2. Raw Distance Points & Line
    ctx.strokeStyle = "rgba(244, 63, 94, 0.4)"; // Light Coral Rose
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, idx) => {
      const px = mapX(s.timeSec);
      const py = mapY(s.rawDistanceM);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Raw dots
    ctx.fillStyle = "#f43f5e";
    samples.forEach((s) => {
      const px = mapX(s.timeSec);
      const py = mapY(s.rawDistanceM);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Smoothed Distance EMA Line
    ctx.strokeStyle = "#38bdf8"; // Vibrant Sky Blue
    ctx.lineWidth = 5;
    ctx.beginPath();
    samples.forEach((s, idx) => {
      const px = mapX(s.timeSec);
      const py = mapY(s.smoothedDistanceM);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Legend Box (Top Right)
    const legX = plotX + plotW - 480;
    const legY = plotY + 20;
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5;
    ctx.fillRect(legX, legY, 460, 130);
    ctx.strokeRect(legX, legY, 460, 130);

    ctx.font = "20px sans-serif";
    ctx.textAlign = "left";

    // Legend Item 1: Raw distance
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    ctx.arc(legX + 25, legY + 30, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1f5f9";
    ctx.fillText("Raw distance (Webcam IPD)", legX + 45, legY + 36);

    // Legend Item 2: Smoothed distance
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(legX + 15, legY + 65);
    ctx.lineTo(legX + 35, legY + 65);
    ctx.stroke();
    ctx.fillStyle = "#f1f5f9";
    ctx.fillText(`Smoothed distance (EMA α=${alpha})`, legX + 45, legY + 71);

    // Legend Item 3: Reference distance
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(legX + 15, legY + 100);
    ctx.lineTo(legX + 35, legY + 100);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f1f5f9";
    ctx.fillText(`Reference distance (${refDist.toFixed(2)} m)`, legX + 45, legY + 106);

    // Footer Watermark
    ctx.fillStyle = "#64748b";
    ctx.font = "18px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      "Monocular Depth-Locked Visual Acuity Validation Pipeline",
      canvas.width - 50,
      canvas.height - 20
    );

    // Trigger Download
    const a = document.createElement("a");
    a.download = "distance_smoothing.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const handleDownloadCSV = () => {
    const exportRows = samples.map((s, i) => ({
      frame_index: i + 1,
      time_s: s.timeSec,
      raw_distance_m: s.rawDistanceM,
      smoothed_distance_m: s.smoothedDistanceM,
      reference_distance_m: s.referenceDistanceM,
      raw_error_cm: Number((Math.abs(s.rawDistanceM - s.referenceDistanceM) * 100).toFixed(2)),
      smoothed_error_cm: Number(
        (Math.abs(s.smoothedDistanceM - s.referenceDistanceM) * 100).toFixed(2)
      ),
    }));
    downloadCSV("distance_smoothing_data.csv", exportRows, undefined, {
      "Data Source": "TEMPORAL_DISTANCE_TRACKING",
      "Smoothing Alpha": alpha,
      "Sample Count": samples.length,
      "Export Timestamp": new Date().toISOString(),
    });
  };

  return (
    <div style={{ marginTop: 24 }}>
      {/* Hidden canvas element for PNG generation */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 18 }}>{title}</h4>
          <p className="muted small" style={{ margin: "4px 0 0 0" }}>
            Webcam IPD distance vs. Exponential Moving Average smoothing (
            <code>
              D_t^{"{EMA}"} = \alpha D_t + (1-\alpha)D_t-1^{"{EMA}"}
            </code>{" "}
            with <strong>&alpha; = {alpha}</strong>)
          </p>
        </div>
        <div className="btn-row">
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadCSV}>
            Download CSV Data
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleDownloadPNG}>
            Download PNG (distance_smoothing.png)
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="card-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ padding: 12 }}>
          <div className="stat-label">Smoothing Alpha (&alpha;)</div>
          <div className="stat-value">{alpha}</div>
        </div>
        <div className="stat-card" style={{ padding: 12 }}>
          <div className="stat-label">Raw Noise StdDev</div>
          <div className="stat-value">{(rawStdDevM * 100).toFixed(2)} cm</div>
        </div>
        <div className="stat-card" style={{ padding: 12 }}>
          <div className="stat-label">Smoothed StdDev</div>
          <div className="stat-value">{(smoothedStdDevM * 100).toFixed(2)} cm</div>
        </div>
        <div className="stat-card" style={{ padding: 12 }}>
          <div className="stat-label">Noise Dampening</div>
          <div className="stat-value" style={{ color: "var(--good)" }}>
            {noiseReductionPct === null ? "N/A (zero raw SD)" : `${noiseReductionPct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {/* Interactive Recharts Graph */}
      <div style={{ width: "100%", height: 360, background: "#0b1329", padding: "16px 12px 12px 0px", borderRadius: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={samples} margin={{ top: 15, right: 30, left: 10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="timeSec"
              unit="s"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              label={{ value: "Time (s)", position: "insideBottom", offset: -15, fill: "#cbd5e1", fontSize: 13 }}
            />
            <YAxis
              domain={[minY, maxY]}
              unit="m"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              label={{
                value: "Viewing Distance (m)",
                angle: -90,
                position: "insideLeft",
                offset: 5,
                fill: "#cbd5e1",
                fontSize: 13,
              }}
            />
            <Tooltip
              contentStyle={{ background: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: 6 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, name: any) => [
                typeof val === "number" ? `${val.toFixed(3)} m` : String(val ?? "—"),
                name === "rawDistanceM"
                  ? "Raw Distance"
                  : name === "smoothedDistanceM"
                  ? "Smoothed (EMA)"
                  : "Reference Distance",
              ]}
              labelFormatter={(t) => `Time: ${t} s`}
            />
            <Legend
              verticalAlign="top"
              wrapperStyle={{ paddingBottom: 10 }}
              formatter={(value) => {
                if (value === "rawDistanceM") return <span style={{ color: "#f43f5e", fontSize: 13 }}>Raw distance</span>;
                if (value === "smoothedDistanceM") return <span style={{ color: "#38bdf8", fontSize: 13, fontWeight: "bold" }}>Smoothed distance (EMA α=0.2)</span>;
                if (value === "referenceDistanceM") return <span style={{ color: "#f59e0b", fontSize: 13 }}>Reference distance</span>;
                return value;
              }}
            />
            <ReferenceLine
              y={refDist}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: `Ref (${refDist.toFixed(2)}m)`, fill: "#f59e0b", position: "right", fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="rawDistanceM"
              stroke="#f43f5e"
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: "#f43f5e" }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="smoothedDistanceM"
              stroke="#38bdf8"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Toggle Data Table */}
      <div style={{ marginTop: 12, textAlign: "right" }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? "Hide Temporal Data Table" : "Show Temporal Data Table"}
        </button>
      </div>

      {showTable && (
        <div style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Frame #</th>
                <th>Time (s)</th>
                <th>Raw distance (m)</th>
                <th>Smoothed distance (m)</th>
                <th>Reference distance (m)</th>
                <th>Raw Error (cm)</th>
                <th>Smoothed Error (cm)</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s, i) => {
                const rawErr = Math.abs(s.rawDistanceM - s.referenceDistanceM) * 100;
                const smoothErr = Math.abs(s.smoothedDistanceM - s.referenceDistanceM) * 100;
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{s.timeSec.toFixed(3)} s</td>
                    <td>{s.rawDistanceM.toFixed(4)} m</td>
                    <td style={{ fontWeight: "bold", color: "var(--accent)" }}>
                      {s.smoothedDistanceM.toFixed(4)} m
                    </td>
                    <td>{s.referenceDistanceM.toFixed(2)} m</td>
                    <td>{rawErr.toFixed(2)} cm</td>
                    <td>{smoothErr.toFixed(2)} cm</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
