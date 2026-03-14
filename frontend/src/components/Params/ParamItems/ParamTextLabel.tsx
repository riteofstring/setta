import { getParamDisplayName } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useMisc } from "state/stores/layoutInteractionStores";

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
      className={`${bg} cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200`}
      onClick={onClick}
      onMouseDownCapture={onMouseDown} // has to be on capture for selection to work
    >
      {name}
    </p>
  );
}
