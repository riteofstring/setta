import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";
import { curryAction } from "./utils";

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

export function useGetParamCollections(sectionInfoId) {
  const paramCollectionIds = useStoreState(
    (x) => x.sectionInfos.paramCollectionIds[sectionInfoId]
  );
  const allParamCollections = useStoreState(
    (x) => x.master.allParamCollections
  );
  const paramCollections = paramCollectionIds.map(
    (x) => allParamCollections.children[x]
  );
  const pc = _.merge({}, ...paramCollections.map((x) => x.children));
  return Object.values(pc);
}

export function useGetAllParamInfos(sectionInfoId, objInfo) {
  const objParamInfos = objInfo.children ? Object.values(objInfo.children) : [];
  const paramCollections = useGetParamCollections(sectionInfoId);
  return [...objParamInfos, ...paramCollections];
}

export function useParamInfoState(stateName, setStateFn, key) {
  return (sectionId) => {
    const setX = curryAction(
      useStoreActions((x) => x.paramInfos[setStateFn]),
      { sectionId }
    );
    const x = useStoreState((x) => x.paramInfos[stateName].h[sectionId]);
    return (paramInfoId) => {
      const setX_ = curryAction(setX, { paramInfoId }, key);
      const x_ = x?.[paramInfoId];
      return [x_, setX_];
    };
  };
}

export function useParamEnteredValue(sectionId) {
  return useParamInfoState(
    "enteredValue",
    "setEnteredValue",
    "value"
  )(sectionId);
}

export function useParamChildId(sectionId) {
  return useParamInfoState("childId", "setChildId", "childId")(sectionId);
}

export function useParamUITypeId(sectionId) {
  return useParamInfoState("uiTypeId", "setUITypeId", "uiTypeId")(sectionId);
}

export function useGetParamUIType(sectionId) {
  const uiTypeIdFn = useParamUITypeId(sectionId);
  return (paramInfo) => {
    const uiTypeId = uiTypeIdFn(paramInfo.id)[0];
    const uiType = useStoreState((x) => x.uiTypes.uiType[uiTypeId]);
    return uiType ? uiType : paramInfo.uiType;
  };
}

export function useGetUITypeConfig(uiType) {
  const uiTypeConfigId = useStoreState((x) => x.uiTypes.configId[uiType.id]);
  const uiTypeConfig = useStoreState(
    (x) => x.uiTypeConfigs.config[uiTypeConfigId]
  );
  return uiTypeConfig ? uiTypeConfig : uiType.config;
}
