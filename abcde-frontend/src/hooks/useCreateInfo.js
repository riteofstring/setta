import { SectionInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import _ from "lodash";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";
import { useGetChildUITypeId } from "./useUIType";

export function createManySectionInfo({ sectionInfoProps, numChildren }) {
  const newInfos = {};
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = new SectionInfo(sectionInfoProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  return newInfos;
}

export function useCreateSectionInfo(sectionId) {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const getChildUITypeId = useGetChildUITypeId();
  const parentUIType = useGetSectionType(sectionId);
  const parentSectionInfo = useGetSectionInfo(sectionId);

  return ({ numChildren, ...sectionInfoProps }) => {
    const uiTypeId = getChildUITypeId(sectionInfoProps.uiTypeId, parentUIType);
    const newInfos = createManySectionInfo({
      sectionInfoProps: { ...sectionInfoProps, parentSectionInfo, uiTypeId },
      numChildren,
    });
    setSectionInfo((x) => ({ ...x, ...newInfos }));
    return _.keys(newInfos);
  };
}
