import { SectionInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import _ from "lodash";

import { useGetSectionInfo } from "./useSectionInfo";
import { getNewUIType } from "./useUIType";

export function createSectionInfo({ sectionInfoProps, uiTypeProps }) {
  let { uiTypeId } = sectionInfoProps;
  let uiType = null;
  if (!uiTypeId) {
    uiType = getNewUIType(uiTypeProps);
    uiTypeId = uiType.id;
  }
  const sectionInfo = new SectionInfo({ ...sectionInfoProps, ...uiTypeId });
  return { sectionInfo, uiType };
}

export function createManySectionInfoOfSameType({
  sectionInfoProps,
  uiTypeProps,
  numChildren,
}) {
  const newInfos = {};
  const newUITypes = {};
  for (let i = 0; i < numChildren; i++) {
    const { sectionInfo, uiType } = createSectionInfo({
      sectionInfoProps,
      uiTypeProps,
    });
    newInfos[sectionInfo.id] = sectionInfo;
    if (uiType) {
      newUITypes[uiType.id] = uiType;
    }
  }
  return [newInfos, newUITypes];
}

export function useCreateSectionInfo(sectionId) {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setManyUITypes = useStoreActions((x) => x.uiTypes.setManyUITypes);
  const parentSectionInfo = useGetSectionInfo(sectionId);

  return ({ numChildren, ...sectionInfoProps }) => {
    const [newInfos, newUITypes] = createManySectionInfoOfSameType({
      sectionInfoProps: { ...sectionInfoProps, parentSectionInfo },
      numChildren,
    });
    setSectionInfo((x) => ({ ...x, ...newInfos }));
    setManyUITypes({ uiTypes: _.values(newUITypes) });
    return _.keys(newInfos);
  };
}
