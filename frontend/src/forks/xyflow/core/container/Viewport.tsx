import { type ReactNode } from "react";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import { useViewportTransformStyleRef } from "./useViewportTransformStyle";

type ViewportProps = {
  children: ReactNode;
};

function Viewport({ children }: ViewportProps) {
  const { initialTransform, ref } =
    useViewportTransformStyleRef<HTMLDivElement>();

  return (
    <div
      className="react-flow__viewport react-flow__container"
      ref={ref}
      style={{ transform: initialTransform }}
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
