import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionHideUnpinnedParams } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
export function HideShowUnpinnedParamsButton({ sectionId }) {
  const hideUnpinnedParams = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return impl.hideUnpinnedParams;
  });
  function onClick() {
    const nextHideUnpinnedParams = !hideUnpinnedParams;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          {
            hideUnpinnedParams: nextHideUnpinnedParams,
          },
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setSectionHideUnpinnedParams({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              hideUnpinnedParams: nextHideUnpinnedParams,
              frontendOpId,
            },
          } as Parameters<typeof setSectionHideUnpinnedParams>[0]),
        ),
    });
  }
  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick}>
      {hideUnpinnedParams ? "Show Unpinned Params" : "Hide Unpinned Params"}
    </MenuItem>
  );
}
