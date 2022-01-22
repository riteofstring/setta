import { SectionInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import { createNewId } from "utils/sectionIds";

import { useGetSectionInfo } from "./useSectionInfo";

export function createSectionInfoFn({
  name,
  uiTypeId,
  numChildren,
  parentSectionInfo,
  setSectionInfo,
  paramInfoId,
}) {
  const newInfos = {};
  for (let i = 0; i < numChildren; i++) {
    const info = new SectionInfo({
      id: createNewId(),
      name,
      uiTypeId,
      parentSectionInfo,
      paramCollectionId: createNewId(),
      kwargCollectionId: createNewId(),
      paramInfoId,
    });
    newInfos[info.id] = info;
  }
  setSectionInfo((x) => ({ ...x, ...newInfos }));
  return Object.keys(newInfos);
}

export function useCreateSectionInfo(sectionId) {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const parentSectionInfo = useGetSectionInfo(sectionId);

  console.log("useCreateSectionInfo");

  const createInfo = ({ name, uiTypeId, numChildren, paramInfoId }) => {
    return createSectionInfoFn({
      name,
      uiTypeId,
      numChildren,
      parentSectionInfo,
      setSectionInfo,
      paramInfoId,
    });
  };

  return createInfo;
}
