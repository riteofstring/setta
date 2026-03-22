import { MenuItem } from "./DropdownMenuItem";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_callable_hide_params } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

export function HideShowParamsButton({ sectionId }) {
  const { hasParams, hideParams } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Callable,
    );
    return { hasParams: false, hideParams: impl.hideParams };
  }, _.isEqual);

  function onClick() {
    const nextHideParams = !hideParams;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"CallableSection">(state, sectionId, {
          hideParams: nextHideParams,
        });
      },
      send: (frontendOpId) =>
        route_set_callable_hide_params({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          hideParams: nextHideParams,
          frontendOpId,
        }),
    });
  }

  return (
    !hasParams && (
      <MenuItem onClick={onClick}>
        {hideParams ? "Show Params" : "Hide Params"}
      </MenuItem>
    )
  );
}
