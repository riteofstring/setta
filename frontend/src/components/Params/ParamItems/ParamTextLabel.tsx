import { getParamDisplayName } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";

export function ParamTextLabel({ sectionId, paramInfoId, onMouseDown, bg }) {
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
      className={`${bg} section-key min-w-0 cursor-pointer truncate overflow-hidden py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200`}
      onClick={onClick}
      onMouseDownCapture={onMouseDown} // has to be on capture for selection to work
    >
      {name}
    </p>
  );
}
