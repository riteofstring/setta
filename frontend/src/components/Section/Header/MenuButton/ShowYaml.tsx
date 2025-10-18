import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_section_with_params_display_mode } from "utils/generatedEndpoints";
import {
  isBaseSectionWithParamsImpl,
  SectionWithParamsDisplayModeEnum,
} from "utils/generatedTypes";

export function ShowYaml({ sectionId }) {
  const displayMode = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return impl.displayMode;
  });

  function onClick() {
    const newDisplayMode =
      displayMode === SectionWithParamsDisplayModeEnum.Yaml
        ? SectionWithParamsDisplayModeEnum.Gui
        : SectionWithParamsDisplayModeEnum.Yaml;

    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          { displayMode: newDisplayMode },
        );
      },
      send: (frontendOpId) =>
        route_set_section_with_params_display_mode({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          displayMode: newDisplayMode,
          frontendOpId,
        }),
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {displayMode === SectionWithParamsDisplayModeEnum.Yaml
        ? "Show GUI"
        : "Show Yaml"}
    </MenuItem>
  );
}
