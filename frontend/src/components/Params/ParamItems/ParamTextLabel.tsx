import { getParamDisplayName } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";
import type { MouseEventHandler } from "react";

export function ParamTextLabel({
  sectionId,
  paramInfoId,
  onMouseDown,
  bg,
  hasChildren = false,
}: {
  sectionId: string;
  paramInfoId: string;
  onMouseDown?: MouseEventHandler;
  bg: string;
  hasChildren?: boolean;
}) {
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
      className={`${hasChildren ? "section-key-value" : "section-key"} param-row-label overflow-hidden ${bg} cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200`}
      style={
        hasChildren ? undefined : { width: "var(--param-column-width, 200px)" }
      }
      onClick={onClick}
      onMouseDownCapture={onMouseDown} // has to be on capture for selection to work
    >
      {name}
    </p>
  );
}
