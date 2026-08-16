import { type ReactNode } from "react";
import {
  CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME,
  useCodeMirrorTooltipParentRef,
} from "./codeMirrorTooltipParent";
import { useReactFlow } from "./store";
import type { ReactFlowState } from "./types";

const selector = (s: ReactFlowState) =>
  `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`;

type ViewportProps = {
  children: ReactNode;
};

function Viewport({ children }: ViewportProps) {
  const transform = useReactFlow(selector);
  const tooltipParentRef = useCodeMirrorTooltipParentRef();

  return (
    <div
      className="react-flow__viewport react-flow__container"
      style={{ transform }}
    >
      {children}
      {/* The reference's canvas tooltip parent: inside the transformed scene, outside every
       * section's clipping box. */}
      <div
        className={CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME}
        ref={tooltipParentRef}
      />
    </div>
  );
}

export default Viewport;
