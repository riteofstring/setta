import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";

export function ParamTextLabel({ sectionId, paramInfoId, onMouseDown, bg }) {
  const name = useProjectState((x) =>
    getParamDisplayNameIfPresent(x, sectionId, paramInfoId),
  );
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
      className={`${bg} cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200`}
      onClick={onClick}
      onMouseDownCapture={onMouseDown} // has to be on capture for selection to work
    >
      {name}
    </p>
  );
}
