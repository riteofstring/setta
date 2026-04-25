import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { setCallableHideParams } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
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
        callOpenAPI(
          setCallableHideParams({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              hideParams: nextHideParams,
              frontendOpId,
            },
          } as Parameters<typeof setCallableHideParams>[0]),
        ),
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
