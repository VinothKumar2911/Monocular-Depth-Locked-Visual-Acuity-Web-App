import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getTrialsForSession, type TrialRecord } from "../utils/storage";
import { scoreStaircase, distanceStabilityStdDevM } from "../visionAcuity/scoring";
import { logMARToSnellenString, mean } from "../utils/math";
import { createStaircase, stepStaircase, type StaircaseState } from "../visionAcuity/staircase";
import { requiredOptotypeHeightMMForLogMAR } from "../visionAcuity/visualAngle";
import { downloadCSV, downloadJSON } from "../utils/csvExport";

type TrialHistoryRow = TrialRecord & {
  nextLogMAR: number;
  nextSizeMM: number;
  direction: "up" | "down";
  reversal: boolean;
  nextDifficulty: string;
};

export default function Results() {
  const [trials, setTrials] = useState<TrialRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = localStorage.getItem("mdva.lastSessionId");
    if (!sessionId) {
      setLoading(false);
      return;
    }
    getTrialsForSession(sessionId).then((t) => {
      setTrials(t);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="page narrow">
        <p className="muted">Loading results…</p>
      </div>
    );
  }

  if (trials.length === 0) {
    return (
      <div className="page narrow">
        <h2>Visual Acuity Result</h2>
        <p className="muted">No completed test found. Run the test first.</p>
        <Link className="btn btn-primary" to="/test">
          Go to Test
        </Link>
      </div>
    );
  }

  let staircase: StaircaseState = createStaircase();
  const trialHistory: TrialHistoryRow[] = trials.map((trial) => {
    const previousReversals = staircase.reversals;
    const nextStaircase = stepStaircase(staircase, !!trial.correct);
    const row: TrialHistoryRow = {
      ...trial,
      nextLogMAR: nextStaircase.currentLogMAR,
      nextSizeMM: requiredOptotypeHeightMMForLogMAR(trial.distanceMeters, nextStaircase.currentLogMAR),
      direction: trial.correct ? "down" : "up",
      reversal: nextStaircase.reversals > previousReversals,
      nextDifficulty: logMARToSnellenString(nextStaircase.currentLogMAR),
    };
    staircase = nextStaircase;
    return row;
  });
  const acuity = scoreStaircase(staircase);

  const distances = trials.map((t) => t.distanceMeters);
  const avgDistance = mean(distances);
  const stability = distanceStabilityStdDevM(distances);
  const correctCount = trials.filter((t) => t.correct).length;

  const chartData = trialHistory.map((t) => ({
    trial: t.trial,
    distance: Number(t.distanceMeters.toFixed(3)),
    sizeMM: Number(t.optotypeHeightMM.toFixed(3)),
    nextSizeMM: Number(t.nextSizeMM.toFixed(3)),
  }));

  return (
    <div className="page">
      <div className="section-heading">
        <h2>Visual Acuity Result</h2>
      </div>
      <p className="muted small">Experimental visual-acuity estimate — not a substitute for a professional eye exam.</p>

      <div className="card center">
        <div className="stat-label">Estimated Visual Acuity</div>
        <div style={{ fontSize: 48, fontWeight: 750 }}>{acuity.snellen}</div>
        <div className="muted">logMAR: {acuity.logMAR.toFixed(2)}</div>
      </div>

      <div className="card-grid" style={{ marginTop: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Average Viewing Distance</div>
          <div className="stat-value">{avgDistance.toFixed(2)} m</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Distance Stability</div>
          <div className="stat-value">±{(stability * 100).toFixed(1)} cm</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Number of Trials</div>
          <div className="stat-value">{trials.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reversals</div>
          <div className="stat-value">{acuity.reversals}</div>
          <div className="stat-sub">Direction changes in the staircase</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Correct Responses</div>
          <div className="stat-value">
            {correctCount} / {trials.length}
          </div>
        </div>
      </div>

      <div className="card staircase-card">
        <div className="section-heading">
          <div>
            <h3>Trial History</h3>
            <p className="muted small">Each answer changes the next optotype size and difficulty.</p>
          </div>
          <span className="badge neutral">{acuity.reversals} reversals</span>
        </div>
        <div className="table-scroll">
          <table className="data-table staircase-table">
            <thead>
              <tr>
                <th>Trial</th>
                <th>Distance</th>
                <th>E size</th>
                <th>Difficulty</th>
                <th>Response</th>
                <th>Next E size</th>
                <th>Next difficulty</th>
              </tr>
            </thead>
            <tbody>
              {trialHistory.map((trial) => (
                <tr key={trial.id ?? trial.trial} className={trial.reversal ? "reversal-row" : undefined}>
                  <td className="mono">{trial.trial}</td>
                  <td>{trial.distanceMeters.toFixed(2)} m</td>
                  <td><strong>{trial.optotypeHeightMM.toFixed(2)} mm</strong></td>
                  <td>{logMARToSnellenString(trial.logMAR)} <span className="muted small">({trial.logMAR.toFixed(2)})</span></td>
                  <td>
                    <span className={`badge ${trial.correct ? "good" : "bad"}`}>
                      {trial.correct ? "✓ Correct" : "✕ Wrong"}
                    </span>
                  </td>
                  <td>
                    <strong>{trial.nextSizeMM.toFixed(2)} mm</strong>
                    <span className={`staircase-direction ${trial.direction}`}>
                      {trial.direction === "down" ? "↓ smaller" : "↑ larger"}
                    </span>
                  </td>
                  <td>
                    {trial.nextDifficulty}
                    {trial.reversal && <span className="reversal-label">Reversal</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Viewing distance vs. trial</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="trial" tick={{ fontSize: 12 }} label={{ value: "Trial", position: "insideBottom", offset: -4, fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} label={{ value: "m", angle: -90, position: "insideLeft", fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="distance" stroke="#1c6fd8" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3>Optotype size staircase</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="trial" tick={{ fontSize: 12 }} label={{ value: "Trial", position: "insideBottom", offset: -4, fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} label={{ value: "mm", angle: -90, position: "insideLeft", fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="sizeMM" stroke="#1a8a5f" dot={false} strokeWidth={2} />
            <Line type="stepAfter" dataKey="nextSizeMM" stroke="#b8720a" dot={false} strokeWidth={2} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={() => downloadCSV("va-test-trials.csv", trials)}>
          Export Trials (CSV)
        </button>
        <button className="btn btn-secondary" onClick={() => downloadJSON("va-test-trials.json", { acuity, trials })}>
          Export Trials (JSON)
        </button>
        <Link className="btn btn-primary" to="/test">
          Run Another Test
        </Link>
      </div>
    </div>
  );
}
