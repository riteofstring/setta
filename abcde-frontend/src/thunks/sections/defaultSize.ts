import { RCType } from "abcde-utils/src/types/codeInfo";
import { SectionSizeType } from "abcde-utils/src/types/sectionSize";
import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import { useCodeInfo } from "models/info/codeInfo";
import { useUITypes } from "models/info/uiTypes";
import { SECTIONWIDTH } from "utils/constants";

export function getInitialSize({ uiTypeId }): SectionSizeType {
  const hasSearch = getHasSearch(uiTypeId);
  const hasTitle = true;
  const hasKwargControl = true;

  const height =
    (hasTitle ? 50 : 0) + (hasSearch ? 50 : 0) + (hasKwargControl ? 100 : 0);

  return { width: SECTIONWIDTH, height };
}

function getHasSearch(uiTypeId) {
  if (!uiTypeId) {
    return false;
  }

  const { collections } = useUITypes.getState().x[uiTypeId]
    .config as SectionUITypeConfigType;

  if (collections.length === 0) {
    return false;
  }

  return collections.some(
    (x) => useCodeInfo.getState().allCodeInfo[x].rcType === RCType.COLLECTION
  );
}
