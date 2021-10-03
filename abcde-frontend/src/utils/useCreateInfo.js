import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";
import { UIType } from "../classes/uiType";
import { createNewId } from "./sectionIds";
import { curryAction, defaultState } from "./utils";

function getInfo(x) {
  return x.x;
}

export function useCreateSectionInfo(sectionId, parentIsSection) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);
  const allParamCollections = useStoreState(
    (x) => x.master.allParamCollections
  );
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setSectionType = useStoreActions((x) => x.sectionTypes.setSectionType);
  const parentSectionInfo = useGetSectionInfo(sectionId);
  const parentSectionType = useGetSectionType(sectionId);

  const createInfo = ({ name, id, uiType, uiTypeConfig }) => {
    console.log("createInfo parentSectionInfo", parentSectionInfo);
    const infoFactoryOutput = createSectionInfo(
      name,
      allObjCollections,
      allParamCollections,
      id,
      parentSectionInfo,
      parentSectionType,
      uiType,
      uiTypeConfig,
      uiSpecs,
      parentIsSection
    );
    const { info, sectionTypeId, sectionType } = infoFactoryOutput;
    setSectionInfo({ sectionId: id, sectionInfo: info });
    setSectionType({ sectionTypeId, sectionType });
    return id;
  };

  return createInfo;
}

export function useGetSectionInfo(sectionId) {
  return defaultState(
    useStoreState((x) => getInfo(x.sectionInfos)[sectionId]),
    () => ({})
  );
}

export function useGetSectionType(sectionId) {
  const sectionTypeId = useGetSectionInfo(sectionId).sectionTypeId;
  return defaultState(
    useStoreState((x) => getInfo(x.sectionTypes)[sectionTypeId]),
    () => ({})
  );
}

export function useGetXInfos(collectionName, allCollectionName, sectionId) {
  const sectionType = useGetSectionType(sectionId);
  const collectionIds = sectionType[collectionName];
  const allCollections = useStoreState((x) => x.master[allCollectionName]);
  const collections = collectionIds.map((x) => allCollections.children[x]);
  const output = _.merge({}, ...collections.map((x) => x.children));
  return Object.values(output);
}

export function useGetObjInfos(sectionId) {
  return useGetXInfos("objCollectionIds", "allObjCollections", sectionId);
}

export function useGetParamCollections(sectionId) {
  return useGetXInfos("paramCollectionIds", "allParamCollections", sectionId);
}

export function useGetAllParamInfos(sectionId, objInfo) {
  const objParamInfos = objInfo.children ? Object.values(objInfo.children) : [];
  const paramCollections = useGetParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useParamInfoState(stateName, setStateFn, key) {
  return (sectionId) => {
    const setX = curryAction(
      useStoreActions((x) => x.paramInfos[setStateFn]),
      { sectionId }
    );
    const x = useStoreState((x) => getInfo(x.paramInfos)[sectionId]);
    return (paramInfoId) => {
      const setX_ = curryAction(setX, { paramInfoId }, key);
      const x_ = x?.[paramInfoId]?.[stateName];
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
    return defaultState(
      useStoreState((x) => getInfo(x.uiTypes)[uiTypeId]),
      () => ({})
    );
  };
}

export function useUITypeConfig(uiType) {
  const uiTypeConfig = defaultState(
    useStoreState((x) => getInfo(x.uiTypeConfigs)[uiType.configId]),
    () => {}
  );
  const x = useStoreActions((x) => x.uiTypeConfigs.setOneConfig);
  const setUITypeConfig = ({ configName, value }) => {
    x({ configId: uiTypeConfigId, configName, value });
  };
  return [uiTypeConfig, setUITypeConfig];
}

export function useInitializeUIType(sectionId) {
  const uiTypeFn = useParamUITypeId(sectionId);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const setConfigId = useStoreActions((x) => x.uiTypes.setConfigId);
  const setConfig = useStoreActions((x) => x.uiTypeConfigs.setConfig);
  return (paramInfo) => {
    const [uiTypeId, setUITypeId] = uiTypeFn(paramInfo.id);
    if (!uiTypeId) {
      const newUIType = new UIType({
        id: createNewId(),
        name: paramInfo.uiTypeName,
      });
      setUITypeId(newUIType.id);
      setUIType({ uiTypeId: newUIType.id, uiType: newUIType });

      const configId = createNewId();
      const config = Object.assign({}, paramInfo.uiTypeConfig);
      setConfigId({ uiTypeId: newUIType.id, configId: configId });
      setConfig({ configId, config });
    }
  };
}
