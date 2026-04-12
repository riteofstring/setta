import { useReactFlow } from "forks/xyflow/core/store";
import { useEffect, useRef, type ReactNode } from "react";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";

export const getViewportTransformStyle = (
  transform: [number, number, number],
) => `translate(${transform[0]}px,${transform[1]}px) scale(${transform[2]})`;

type ViewportProps = {
  children: ReactNode;
};

function Viewport({ children }: ViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncTransform = (transform: [number, number, number]) => {
      if (!viewportRef.current) {
        return;
      }
      viewportRef.current.style.transform =
        getViewportTransformStyle(transform);
    };

    syncTransform(useReactFlow.getState().transform);

    return useReactFlow.subscribe((state) => state.transform, syncTransform);
  }, []);

  return (
    <div
      className="react-flow__viewport react-flow__container"
      ref={viewportRef}
      style={{
        transform: getViewportTransformStyle(useReactFlow.getState().transform),
      }}
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
