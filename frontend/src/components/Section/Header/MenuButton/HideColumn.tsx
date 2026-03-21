import { MenuItem } from "./DropdownMenuItem";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_browser_hide_column } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

export function HideColumn({ sectionId }) {
  const hideColumn = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Browser,
    );
    return impl.hideColumn;
  });

  function onClick() {
    const nextHideColumn = !hideColumn;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BrowserSection">(state, sectionId, {
          hideColumn: nextHideColumn,
        });
      },
      send: (frontendOpId) =>
        route_set_browser_hide_column({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          hideColumn: nextHideColumn,
          frontendOpId,
        }),
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {hideColumn ? "Show Filters" : "Hide Filters"}
    </MenuItem>
  );
}
