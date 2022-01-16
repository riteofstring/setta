import { createSectionInfo } from "classes/infoFactory";
import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";

export function createSectionInfoFn({
  name,
  sectionTypeName,
  numChildren,
  parentSectionInfo,
  parentSectionType,
  sectionSpecs,
  setSectionInfo,
  setSectionType,
  paramInfoId,
}) {
  const newInfos = {};
  const newSectionTypes = {};
  for (let i = 0; i < numChildren; i++) {
    const infoFactoryOutput = createSectionInfo(
      name,
      sectionTypeName,
      parentSectionInfo,
      parentSectionType,
      sectionSpecs,
      paramInfoId
    );
    const { info, sectionType } = infoFactoryOutput;
    newInfos[info.id] = info;
    newSectionTypes[sectionType.id] = sectionType;
  }
  setSectionInfo((x) => ({ ...x, ...newInfos }));
  setSectionType((x) => ({ ...x, ...newSectionTypes }));
  return Object.keys(newInfos);
}

export function useCreateSectionInfo(sectionId) {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setSectionType = useStoreActions((x) => x.sectionTypes.setSectionType);
  const parentSectionInfo = useGetSectionInfo(sectionId);
  const parentSectionType = useGetSectionType(sectionId);

  console.log("useCreateSectionInfo");

  const createInfo = ({
    name,
    sectionTypeName,
    sectionSpecs,
    numChildren,
    paramInfoId,
  }) => {
    return createSectionInfoFn({
      name,
      sectionTypeName,
      numChildren,
      parentSectionInfo,
      parentSectionType,
      sectionSpecs,
      setSectionInfo,
      setSectionType,
      paramInfoId,
    });
  };

  return createInfo;
}

export function useGroupedObjInfos(objInfos) {
  const allPackageInfo = useStoreState((x) => x.master.allPackageInfo);
  const allModuleInfo = useStoreState((x) => x.master.allModuleInfo);
  return _.groupBy(objInfos, (x) => {
    const { name: moduleName, parentId: packageId } = allModuleInfo[x.parentId];
    const { name: packageName, version } = allPackageInfo.children[packageId];
    return `${packageName}.${moduleName} v${version}`;
  });
}

export function useSetUITypeDirect(uiTypeCollectionId, paramInfoId) {
  const uiTypeId = useStoreState(
    (x) => x.paramInfos.y[uiTypeCollectionId]?.[paramInfoId]?.uiTypeId
  );
  const setOneConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  return [uiTypeId, setOneConfig];
}
