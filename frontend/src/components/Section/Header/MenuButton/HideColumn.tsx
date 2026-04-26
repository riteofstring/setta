import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setBrowserHideColumn } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
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
        callOpenAPI(
          setBrowserHideColumn({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              hideColumn: nextHideColumn,
              frontendOpId,
            },
          } as Parameters<typeof setBrowserHideColumn>[0]),
        ),
    });
  }
  return (
    <MenuItem onClick={onClick}>
      {hideColumn ? "Show Filters" : "Hide Filters"}
    </MenuItem>
  );
}
