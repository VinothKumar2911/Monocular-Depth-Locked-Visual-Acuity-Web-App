import { HashRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { VisionProvider } from "./context/VisionContext";
import TopNav from "./components/TopNav";
import Home from "./pages/Home";
import { routeImports } from "./routePreload";

const CameraSetup = lazy(routeImports["/camera-setup"]);
const Calibration = lazy(routeImports["/calibration"]);
const VisualAcuityTest = lazy(routeImports["/test"]);
const Results = lazy(routeImports["/results"]);
const Validation = lazy(routeImports["/validation"]);
const About = lazy(routeImports["/about"]);

function RouteLoading() {
  return (
    <div className="page route-loading" role="status" aria-live="polite">
      <div className="loading-kicker">Preparing workspace</div>
      <div className="loading-line loading-line-wide" />
      <div className="loading-line" />
      <div className="loading-panel" />
    </div>
  );
}

export default function App() {
  return (
    <VisionProvider>
      <HashRouter>
        <div className="app-shell">
          <TopNav />
          <Suspense fallback={<RouteLoading />}>
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
