import { NavLink } from "react-router-dom";
import { preloadRoute } from "../routePreload";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/camera-setup", label: "Camera Setup" },
  { to: "/calibration", label: "Calibration" },
  { to: "/test", label: "Test" },
  { to: "/results", label: "Results" },
  { to: "/validation", label: "Validation" },
  { to: "/about", label: "About" },
];

export default function TopNav() {
  return (
    <nav className="topnav">
      <NavLink to="/" className="brand">
        <span className="brand-dot" />
        Monocular Depth-Locked VA
      </NavLink>
      <div className="nav-links">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => (isActive ? "active" : "")}
            onMouseEnter={() => preloadRoute(l.to)}
            onFocus={() => preloadRoute(l.to)}
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
