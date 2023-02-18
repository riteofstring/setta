import { isRoot } from "abcde-utils/src/constants";
import { RCType } from "abcde-utils/src/types/codeInfo";
import { SizeType } from "abcde-utils/src/types/size";
import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { SECTIONWIDTH } from "utils/constants";

export function getInitialSize({ parentId, uiTypeId }): SizeType {
  const { hasSearch, isRoot } = getHasSearchAndIsRoot(uiTypeId);
  const hasTitle = true;
  const hasKwargControl = true;
  const height = isRoot
    ? 50
    : (hasTitle ? 50 : 0) + (hasSearch ? 50 : 0) + (hasKwargControl ? 100 : 0);

  const width = parentId
    ? useSectionInfos.getState().x[parentId].size.width
    : SECTIONWIDTH;

  return { width, height };
}

function getHasSearchAndIsRoot(uiTypeId) {
  if (!uiTypeId) {
    return { hasSearch: false, isRoot: false };
  }
  const uiType = useUITypes.getState().x[uiTypeId];
  const isRoot_ = isRoot(uiType.type);
  const { collections } = uiType.config as SectionUITypeConfigType;
  const hasSearch =
    collections.length !== 0 ||
    collections.some(
      (x) => useCodeInfo.getState().allCodeInfo[x].rcType === RCType.COLLECTION
    );

  return { hasSearch, isRoot: isRoot_ };
}
