import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";
import { UIType } from "../classes/uiType";
import { createNewId } from "./sectionIds";
import { curryAction, defaultState } from "./utils";

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

export function useGetXInfos(collectionName, allCollectionName) {
  const collectionIds = useStoreState((x) => x.sectionInfos[collectionName]);
  const allCollections = useStoreState((x) => x.master[allCollectionName]);
  return (sectionInfoId) => {
    const collections = collectionIds[sectionInfoId].map(
      (x) => allCollections.children[x]
    );
    const output = _.merge({}, ...collections.map((x) => x.children));
    return Object.values(output);
  };
}

export function useGetObjInfos(sectionInfoId) {
  return useGetXInfos("objCollectionIds", "allObjCollections")(sectionInfoId);
}

export function useGetParamCollections(sectionInfoId) {
  return useGetXInfos(
    "paramCollectionIds",
    "allParamCollections"
  )(sectionInfoId);
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
    const x = useStoreState(
      (x) => x.paramInfos.uiTypeId.h[sectionId]?.[paramInfo.id]
    );
    const output = useStoreState((x) => x.uiTypes.uiType.h[uiTypeId]);
    return output;
  };
}

export function useConfig(typeName, stateName) {
  return (type) => {
    const configId = useStoreState((x) => x[typeName][stateName][type.id]);
    const config = defaultState(
      useStoreState((x) => x.uiTypeConfigs.config[configId]),
      {}
    );
    const x = useStoreActions((x) => x.uiTypeConfigs.setOneConfig);
    const setUITypeConfig = ({ configName, value }) => {
      x({ configId, configName, value });
    };
    return [config, setUITypeConfig];
  };
}

export function useUITypeConfig(uiType) {
  return useConfig("uiTypes", "configId")(uiType);
}

export function useSectionTypeConfig(sectionType) {
  return useConfig("sectionTypes", "configId")(sectionType);
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
