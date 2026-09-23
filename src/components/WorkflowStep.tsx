import { Link } from "react-router-dom";
import { preloadRoute } from "../routePreload";

type WorkflowStepProps = {
  number: string;
  title: string;
  detail: string;
  to: string;
  action: string;
};

export default function WorkflowStep({ number, title, detail, to, action }: WorkflowStepProps) {
  return (
    <article className="workflow-step">
      <div className="workflow-number">{number}</div>
      <div className="workflow-copy">
        <div className="stat-label">{title}</div>
        <p>{detail}</p>
      </div>
      <Link className="workflow-link" to={to} onMouseEnter={() => preloadRoute(to)} onFocus={() => preloadRoute(to)}>
        {action}
        <span aria-hidden="true">-&gt;</span>
      </Link>
    </article>
  );
}
