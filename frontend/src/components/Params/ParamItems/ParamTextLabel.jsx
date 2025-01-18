import { useMisc, useSectionInfos } from "state/definitions";
import { focusAndMovePaneToIncludeElement } from "utils/tabbingLogic";

export function ParamTextLabel({ sectionId, paramInfoId, onMouseDown, bg }) {
  const name = useSectionInfos((x) => x.codeInfo[paramInfoId].name);

  function onClick() {
    if (useMisc.getState().isSelectingParams) {
      return;
    }
    const paramInputEl = document.getElementById(
      `${sectionId}-${paramInfoId}-ParamInput`,
    );
    if (paramInputEl) {
      focusAndMovePaneToIncludeElement(paramInputEl);
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
