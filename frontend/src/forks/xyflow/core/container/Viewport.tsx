import { useReactFlow } from "forks/xyflow/core/store";
import { type ReactNode } from "react";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import type { ReactFlowState } from "../types";

const selector = (s: ReactFlowState) =>
  `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`;

type ViewportProps = {
  children: ReactNode;
};

function Viewport({ children }: ViewportProps) {
  const transform = useReactFlow(selector);

  return (
    <div
      className="react-flow__viewport react-flow__container"
      style={{ transform }}
    >
      {children}
      <div
        className="setta-codemirror-tooltips"
        id={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <div
        className="setta-popover-portals"
        id={SETTA_POPOVER_PORTAL_PARENT_ID}
      />
    </div>
  );
}

export default Viewport;
