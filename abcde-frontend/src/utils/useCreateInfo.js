import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";

export function useCreateSectionInfo() {
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);
  const allParamCollections = useStoreState(
    (x) => x.master.allParamCollections
  );
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setObjCollectionIds = useStoreActions(
    (x) => x.sectionInfos.setObjCollectionIds
  );
  const setParamCollectionIds = useStoreActions(
    (x) => x.sectionInfos.setParamCollectionIds
  );

  const createInfo = (name, specs) => {
    const infoFactoryOutput = createSectionInfo(
      name,
      specs,
      allObjCollections,
      allParamCollections
    );
    const { info, id, objCollectionIds, paramCollectionIds } =
      infoFactoryOutput;

    setSectionInfo((x) => {
      return { ...x, [id]: info };
    });
    setObjCollectionIds((x) => {
      return { ...x, [id]: objCollectionIds };
    });
    setParamCollectionIds((x) => {
      return { ...x, [id]: paramCollectionIds };
    });

    return id;
  };

  return createInfo;
}

export function useGetSectionInfo(sectionId) {
  const sectionInfoId = useStoreState(
    (x) => x.sections.sectionInfoId[sectionId]
  );
  const sectionInfo = useStoreState(
    (x) => x.sectionInfos.sectionInfo[sectionInfoId]
  );

  return sectionInfo;
}

export function useGetObjInfos(sectionInfoId) {
  const objCollectionIds = useStoreState(
    (x) => x.sectionInfos.objCollectionIds[sectionInfoId]
  );
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);
  const objCollections = objCollectionIds.map(
    (x) => allObjCollections.children[x]
  );
  const objs = _.merge({}, ...objCollections.map((x) => x.children));
  return Object.values(objs);
}

export function useGetParamInfos(objInfoId) {
  const paramInfoIds = useStoreState((x) => x.objInfos.paramInfoIds[objInfoId]);
  const paramInfos = useStoreState((x) => x.paramInfos.paramInfo);
  if (paramInfoIds) {
    return paramInfoIds.map((x) => paramInfos[x]);
  }
  return [];
}

export function useGetSectionParamInfos(sectionInfoId) {
  const paramInfoIds = useStoreState(
    (x) => x.sectionInfos.paramInfoIds[sectionInfoId]
  );
  const paramInfos = useStoreState((x) => x.paramInfos.paramInfo);
  return paramInfoIds.map((x) => paramInfos[x]);
}

export function useGetAllParamInfos(sectionInfoId, objInfoId) {
  const objParamInfos = useGetParamInfos(objInfoId);
  const sectionParamInfos = useGetSectionParamInfos(sectionInfoId);
  return [...objParamInfos, ...sectionParamInfos];
}

export function useGetUIType(paramInfoId) {
  const uiTypeId = useStoreState((x) => x.paramInfos.uiTypeId[paramInfoId]);
  const uiType = useStoreState((x) => x.uiTypes.uiType[uiTypeId]);
  return uiType;
}

export function useGetUITypeConfig(uiTypeId) {
  const uiTypeConfigId = useStoreState((x) => x.uiTypes.configId[uiTypeId]);
  const uiTypeConfig = useStoreState(
    (x) => x.uiTypeConfigs.config[uiTypeConfigId]
  );
  return uiTypeConfig;
}
