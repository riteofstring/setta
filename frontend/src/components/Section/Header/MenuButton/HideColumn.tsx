import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities, useShareSectionAccess } from "state/hooks/share";
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
  const { canEditLayout } = useShareCapabilities();
  const canEditSection = useShareSectionAccess(sectionId);
  const isDisabled = !canEditLayout || !canEditSection;

  function onClick() {
    if (isDisabled) {
      return;
    }
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
    <MenuItem onClick={onClick} disabled={isDisabled}>
      {hideColumn ? "Show Types" : "Hide Types"}
    </MenuItem>
  );
}
