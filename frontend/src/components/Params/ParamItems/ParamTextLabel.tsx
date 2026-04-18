import type { CSSProperties, MouseEventHandler } from "react";
import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import { isCanvasOwnedSectionParamLabelRestingText } from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";

type ParamTextLabelProps = {
  bg: string;
  className?: string;
  lightweightCanvasRoot?: boolean;
  onMouseDown?: MouseEventHandler;
  paramInfoId: string;
  sectionId: string;
  style?: CSSProperties;
};

export function ParamTextLabel({
  sectionId,
  paramInfoId,
  onMouseDown,
  bg,
  className,
  lightweightCanvasRoot = false,
  style,
}: ParamTextLabelProps) {
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const name = useProjectState((x) =>
    getParamDisplayNameIfPresent(x, sectionId, paramInfoId),
  );
  const canvasOwnedRestingText =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionParamLabelRestingText(sectionId);
  if (!name) {
    return null;
  }

  function onClick() {
    if (useMisc.getState().isSelectingParams) {
      return;
    }
    const paramInputEl = document.getElementById(
      `${sectionId}-${paramInfoId}-ParamInput`,
    );
    if (paramInputEl) {
      paramInputEl.focus({ preventScroll: true });
    }
  }

  return (
    <p
      className={`${bg} cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200 ${canvasOwnedRestingText ? "opacity-0" : ""} ${className ?? ""}`}
      data-canvas-owned-resting-text={
        canvasOwnedRestingText ? "true" : undefined
      }
      data-canvas-owned-param-label-lightweight={
        lightweightCanvasRoot ? "true" : undefined
      }
      onClick={onClick}
      onMouseDownCapture={onMouseDown} // has to be on capture for selection to work
      style={style}
    >
      {name}
    </p>
  );
}
