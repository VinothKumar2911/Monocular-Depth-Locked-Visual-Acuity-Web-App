import { HashRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { VisionProvider } from "./context/VisionContext";
import TopNav from "./components/TopNav";
import Home from "./pages/Home";

const CameraSetup = lazy(() => import("./pages/CameraSetup"));
const Calibration = lazy(() => import("./pages/Calibration"));
const VisualAcuityTest = lazy(() => import("./pages/VisualAcuityTest"));
const Results = lazy(() => import("./pages/Results"));
const Validation = lazy(() => import("./pages/Validation"));
const About = lazy(() => import("./pages/About"));

export default function App() {
  return (
    <VisionProvider>
      <HashRouter>
        <div className="app-shell">
          <TopNav />
          <Suspense fallback={<div className="page narrow muted">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/camera-setup" element={<CameraSetup />} />
              <Route path="/calibration" element={<Calibration />} />
              <Route path="/test" element={<VisualAcuityTest />} />
              <Route path="/results" element={<Results />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </Suspense>
          <footer className="app-footer">
            Monocular Depth-Locked Visual Acuity — research prototype. Not a substitute for a professional eye
            examination.
          </footer>
        </div>
      </HashRouter>
    </VisionProvider>
  );
}
