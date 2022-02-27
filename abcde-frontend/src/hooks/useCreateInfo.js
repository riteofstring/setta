import { SectionInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import _ from "lodash";
import { DEFAULT_SECTION_UI_TYPE_ID } from "utils/constants";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";
import { useGetChildUITypeId } from "./useUIType";

function createManySectionInfo({ sectionInfoProps, numChildren }) {
  const newInfos = {};
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = new SectionInfo(sectionInfoProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  return newInfos;
}

export function useCreateChildSectionInfo(sectionId) {
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

export function useCreateDefaultSectionInfo(sectionInfoProps) {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  return () => {
    const sectionInfo = new SectionInfo({
      name: "New Section",
      uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
      ...sectionInfoProps,
    });
    const id = sectionInfo.id;
    setSectionInfo((x) => ({ ...x, [id]: sectionInfo }));
    return [id];
  };
}
