import { useReactFlow } from "forks/xyflow/core/store";
import { type ReactNode } from "react";
import type { ReactFlowState } from "../../types";

const selector = (s: ReactFlowState) =>
  `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`;

type ViewportProps = {
  children: ReactNode;
};

function Viewport({ children }: ViewportProps) {
  const transform = useReactFlow(selector);

  return (
    <div
      className="react-flow__viewport react-flow__container nowheel"
      style={{ transform }}
      id="reactflow-viewport"
    >
      {children}
    </div>
  );
}

export default Viewport;
