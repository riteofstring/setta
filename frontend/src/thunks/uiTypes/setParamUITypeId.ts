import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { updateCurrChildren } from "thunks/sections/children";
import { getSectionInfo } from "thunks/sections/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { requiresNestedSection } from "z_utils/constants";
import { initializeChild } from "../initializeParam";
import { maybeIncrementProjectStateVersion } from "../undo";
import { convertValue } from "./convertValue";

export function setParamUITypeId({
  uiTypeId,
  sectionId,
  paramInfoId,
  doInitializeChild = true,
  incrementVersion = false,
}: {
  uiTypeId: string;
  sectionId: string;
  paramInfoId: string;
  doInitializeChild?: boolean;
  incrementVersion?: boolean;
}) {
  const { uiTypeColId } = getSectionInfo(sectionId);

  useParamInfos.getState().setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  if (doInitializeChild) {
    const isNested = requiresNestedSection(
      useUITypes.getState().x[uiTypeId].type
    );

    if (isNested) {
      const paramInfo = useCodeInfo.getState().x[paramInfoId];
      const { paramIdToChildId } = initializeChild(
        sectionId,
        { [paramInfoId]: paramInfo },
        { [paramInfoId]: uiTypeId }
      );

      setSectionInfoAttr({
        sectionId: paramIdToChildId[paramInfoId],
        attr: "uiTypeId",
        value: uiTypeId,
      });
    }
  }

  convertValue({ sectionId, paramInfoId, uiTypeId });
  updateCurrChildren(sectionId);
  maybeIncrementProjectStateVersion(incrementVersion);
}
