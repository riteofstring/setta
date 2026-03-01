import type { MouseEventHandler } from "react";
import { getParamDisplayName } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";

type ParamTextLabelProps = {
  sectionId: string;
  paramInfoId: string;
  onMouseDown?: MouseEventHandler;
  bg: string;
  isNestedParam: boolean;
};

export function ParamTextLabel({
  sectionId,
  paramInfoId,
  onMouseDown,
  bg,
  isNestedParam,
}: ParamTextLabelProps) {
  const name = useProjectState((x) =>
    getParamDisplayName(x, sectionId, paramInfoId),
  );

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
      className={`${!isNestedParam ? "section-key min-w-0 overflow-hidden" : ""} ${bg} cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200`}
      style={
        !isNestedParam
          ? { width: "var(--param-column-width, 200px)" }
          : undefined
      }
      onClick={onClick}
      onMouseDownCapture={onMouseDown} // has to be on capture for selection to work
    >
      {name}
    </p>
  );
}
