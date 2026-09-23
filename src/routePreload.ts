const routeLoaders = {
  "/camera-setup": () => import("./pages/CameraSetup"),
  "/calibration": () => import("./pages/Calibration"),
  "/test": () => import("./pages/VisualAcuityTest"),
  "/results": () => import("./pages/Results"),
  "/validation": () => import("./pages/Validation"),
  "/about": () => import("./pages/About"),
};

export const routeImports = routeLoaders;

export function preloadRoute(path: string) {
  const loader = routeLoaders[path as keyof typeof routeLoaders];
  if (loader) void loader();
}
