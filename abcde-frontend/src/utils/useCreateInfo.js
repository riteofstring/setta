import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";
import { UIType } from "../classes/uiType";
import { createNewId } from "./sectionIds";
import { curryAction, defaultState } from "./utils";

function getInfoH(x) {
  return x.x.h;
}

function getInfo(x) {
  return x.x;
}

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

  const createInfo = (name, specs, id) => {
    const infoFactoryOutput = createSectionInfo(
      name,
      specs,
      allObjCollections,
      allParamCollections,
      id
    );
    const { info, objCollectionIds, paramCollectionIds } = infoFactoryOutput;

    setSectionInfo({ sectionId: id, sectionInfo: info });
    setObjCollectionIds({ sectionId: id, objCollectionIds });
    setParamCollectionIds({ sectionId: id, paramCollectionIds });

    return id;
  };

  return createInfo;
}

export function useGetSectionInfo(sectionId) {
  return useStoreState((x) => getInfo(x.sectionInfos)[sectionId]);
}

export function useGetXInfos(collectionName, allCollectionName, sectionId) {
  const collectionIds = useStoreState(
    (x) => getInfo(x.sectionInfos)[sectionId][collectionName]
  );
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
    const x = useStoreState((x) => getInfoH(x.paramInfos)[sectionId]);
    return (paramInfoId) => {
      const setX_ = curryAction(setX, { paramInfoId }, key);
      const x_ = x?.[paramInfoId][stateName];
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
    const output = useStoreState((x) => getInfoH(x.uiTypes)[uiTypeId]);
    return output;
  };
}

export function useUITypeConfig(uiType) {
  const uiTypeConfigId = useStoreState(
    (x) => getInfoH(x.uiTypes)[uiType.id].configId
  );
  const uiTypeConfig = defaultState(
    useStoreState((x) => getInfo(x.uiTypeConfigs)[uiTypeConfigId]),
    {}
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
