import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";
import { KwargInfo } from "../classes/mutableInfo";
import { UIType } from "../classes/uiType";
import { requiresNestedSection } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import {
  curryAction,
  defaultState,
  insertIntoArrayOrXpend,
} from "../utils/utils";
import { useSetIdsOverview } from "./useIdsOverview";

function getInfo(x) {
  return x.x;
}

function getAttr(x, attr = null) {
  if (attr === null) {
    return x;
  }
  return x[attr];
}

export function createSectionInfoFn({
  name,
  uiType,
  uiTypeConfig,
  numChildren,
  allObjCollections,
  allParamCollections,
  parentSectionInfo,
  parentSectionType,
  uiSpecs,
  parentIsSection,
  setSectionInfo,
  setSectionType,
}) {
  const newInfos = {};
  const newSectionTypes = {};
  for (let i = 0; i < numChildren; i++) {
    const infoFactoryOutput = createSectionInfo(
      name,
      allObjCollections,
      allParamCollections,
      parentSectionInfo,
      parentSectionType,
      uiType,
      uiTypeConfig,
      uiSpecs,
      parentIsSection
    );
    const { info, sectionType } = infoFactoryOutput;
    newInfos[info.id] = info;
    newSectionTypes[sectionType.id] = sectionType;
  }
  setSectionInfo((x) => ({ ...x, ...newInfos }));
  setSectionType((x) => ({ ...x, ...newSectionTypes }));
  return Object.keys(newInfos);
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

  console.log("useCreateSectionInfo");

  const createInfo = ({ name, uiType, uiTypeConfig, numChildren }) => {
    return createSectionInfoFn({
      name,
      uiType,
      uiTypeConfig,
      numChildren,
      allObjCollections,
      allParamCollections,
      parentSectionInfo,
      parentSectionType,
      uiSpecs,
      parentIsSection,
      setSectionInfo,
      setSectionType,
    });
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

export function useGetCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = useGetSectionInfo(sectionId);
  return useGetObjParamKwargInfos(sectionId, selectedItem);
}

export function useGetObjParamKwargInfos(sectionId, objInfoId) {
  const objInfo = useGetObjInfos(sectionId, objInfoId);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  return { objInfo, paramInfos, kwargInfos };
}

export function useGetXInfos(
  collectionName,
  allCollectionName,
  sectionId,
  infoId = null
) {
  const sectionType = useGetSectionType(sectionId);
  const collectionIds = sectionType[collectionName];
  const allCollections = useStoreState((x) => x.master[allCollectionName]);
  const collections = collectionIds.map((x) => allCollections.children[x]);
  const output = _.merge({}, ...collections.map((x) => x.children));
  if (infoId) {
    return output[infoId];
  }
  return Object.values(output);
}

export function useGetObjInfos(sectionId, infoId = null) {
  return useGetXInfos(
    "objCollectionIds",
    "allObjCollections",
    sectionId,
    infoId
  );
}

export function useGetParamCollections(sectionId, infoId = null) {
  return useGetXInfos(
    "paramCollectionIds",
    "allParamCollections",
    sectionId,
    infoId
  );
}

export function useGetKwargInfos(sectionId, objInfo) {
  const kwargInfos = defaultState(
    useStoreState((x) => getInfo(x.kwargInfos)[sectionId]?.[objInfo.id]),
    () => ({})
  );
  return _.values(kwargInfos);
}

export function useGetAllParamInfos(sectionId, objInfo) {
  const objParamInfos = objInfo?.children
    ? Object.values(objInfo.children)
    : [];
  const paramCollections = useGetParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useGetAllParamAndKwargInfos(sectionId, objInfo) {
  return [
    ...useGetAllParamInfos(sectionId, objInfo),
    ...useGetKwargInfos(sectionId, objInfo),
  ];
}

export function useParamInfoState(
  sectionId,
  objInfoId,
  stateName,
  setStateFn,
  key
) {
  return (paramInfoId) => {
    const setX = curryAction(
      useStoreActions((x) => x.paramInfos[setStateFn]),
      { sectionId, objInfoId }
    );
    const x = useStoreState(
      (x) => x.paramInfos[stateName][sectionId]?.[objInfoId]?.[paramInfoId]
    );
    const setX_ = curryAction(setX, { paramInfoId }, key);
    return [x, setX_];
  };
}

export function useParamEnteredValue(sectionId, objInfoId) {
  return useParamInfoState(
    sectionId,
    objInfoId,
    "enteredValues",
    "setEnteredValue",
    "value"
  );
}

export function useParamChildId(sectionId, objInfoId) {
  return useParamInfoState(
    sectionId,
    objInfoId,
    "childIds",
    "setChildId",
    "childId"
  );
}

export function useParamUITypeId(sectionId, objInfoId) {
  return useParamInfoState(
    sectionId,
    objInfoId,
    "uiTypeIds",
    "setUITypeId",
    "uiTypeId"
  );
}

export function useGetParamUIType(sectionId, objInfoId) {
  const uiTypeIdFn = useParamUITypeId(sectionId, objInfoId);
  return (paramInfo) => {
    const uiTypeId = uiTypeIdFn(paramInfo.id)[0];
    return defaultState(
      useStoreState((x) => getInfo(x.uiTypes)[uiTypeId]),
      () => ({})
    );
  };
}

export function useUITypeConfig(uiType) {
  const uiTypeConfigId = uiType.configId;
  const uiTypeConfig = defaultState(
    useStoreState((x) => getInfo(x.uiTypeConfigs)[uiTypeConfigId]),
    () => ({})
  );
  const x = useStoreActions((x) => x.uiTypeConfigs.setOneConfig);
  const setUITypeConfig = ({ configName, value }) => {
    x({ configId: uiTypeConfigId, configName, value });
  };
  return [uiTypeConfig, setUITypeConfig];
}

export function useSetUITypeAndSetIsNested(sectionId, objInfoId, uiTypeFn) {
  const setIsNested = useStoreActions((x) => x.paramInfos.setIsNested);
  return (paramInfo, uiTypeProps) => {
    const paramInfoId = paramInfo.id;
    const name = uiTypeProps.name ? uiTypeProps.name : uiTypeProps.uiType.name;
    const isNested = requiresNestedSection(name);
    uiTypeFn(uiTypeProps);
    setIsNested({ sectionId, objInfoId, paramInfoId, isNested });
  };
}

export function useSetUITypeName(sectionId, objInfoId) {
  const setName = useStoreActions((x) => x.uiTypes.setName);
  return useSetUITypeAndSetIsNested(sectionId, objInfoId, setName);
}

export function useSetUIType(sectionId, objInfoId) {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  return useSetUITypeAndSetIsNested(sectionId, objInfoId, setUIType);
}

export function useInitializeUIType(sectionId, objInfoId) {
  const uiTypeFn = useParamUITypeId(sectionId, objInfoId);
  const setUIType = useSetUIType(sectionId, objInfoId);
  const setConfigId = useStoreActions((x) => x.uiTypes.setConfigId);
  const setConfig = useStoreActions((x) => x.uiTypeConfigs.setConfig);
  return (paramInfo) => {
    const [uiTypeId, setUITypeId] = uiTypeFn(paramInfo.id);
    return () => {
      if (!uiTypeId) {
        const newUIType = new UIType({
          id: createNewId(),
          name: paramInfo.uiTypeName,
        });
        setUITypeId(newUIType.id);
        setUIType(paramInfo, { uiTypeId: newUIType.id, uiType: newUIType });

        const configId = createNewId();
        const config = Object.assign({}, paramInfo.uiTypeConfig);
        setConfigId({ uiTypeId: newUIType.id, configId: configId });
        setConfig({ configId, config });
      }
    };
  };
}

export function useSetKwargName(sectionId, objInfoId) {
  const setName = useStoreActions((x) => x.kwargInfos.setName);
  return (kwargInfoId, name) => {
    setName({
      sectionId,
      objInfoId,
      kwargInfoId,
      name,
    });
  };
}

export function useAddKwarg(sectionId, objInfoId) {
  const setKwargInfo = useStoreActions((x) => x.kwargInfos.setKwargInfo);
  return () => {
    const kwargInfo = new KwargInfo(createNewId(), "", {});
    setKwargInfo({
      sectionId,
      objInfoId,
      kwargInfoId: kwargInfo.id,
      kwargInfo,
    });
  };
}

export function useDeleteKwarg(sectionId, objInfoId) {
  const deleteChild = useDeleteChild(sectionId);
  const deleteKwargInfo = useStoreActions((x) => x.kwargInfos.deleteKwargInfo);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childIdFn = useParamChildId(sectionId, objInfoId);
  return (kwargInfo) => {
    const { id } = kwargInfo;
    const childId = childIdFn(id)[0];
    return () => {
      deleteKwargInfo({ ids: [id] });
      deleteParamInfo({ sectionId, objInfoId, ids: [id] });
      if (childId) {
        deleteChild({ startId: childId });
      }
    };
  };
}

export function useAddChild(sectionId, startId = null) {
  const { selectedItem } = useGetSectionInfo(sectionId);
  const setIdsOverview = useSetIdsOverview(sectionId);
  const setChildId = useStoreActions((x) => x.paramInfos.setChildId);
  const createInfo = useCreateSectionInfo(sectionId, true);

  function addChild({
    name = null,
    uiType = null,
    uiTypeConfig = null,
    numChildren = 1,
    parentParamInfoId = null,
  }) {
    const newIds = createInfo({ name, uiType, uiTypeConfig, numChildren });

    setIdsOverview((x) => {
      let insertIdx = null;
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, true, ...newIds);
    });

    if (parentParamInfoId) {
      setChildId({
        sectionId,
        objInfoId: selectedItem,
        paramInfoId: parentParamInfoId,
        childId: newIds[0],
      });
    }
  }

  return addChild;
}

export function useDeleteChild(sectionId, startId = null) {
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const setIdsOverview = useSetIdsOverview(sectionId);

  function deleteChild({ numChildren = 1 }) {
    let deletedChildren = null;
    setIdsOverview((x) => {
      if (x.length === 0) {
        return x;
      }
      let startIdx = 0;
      if (startId !== null) {
        startIdx = x.indexOf(startId);
      }
      const endIdx = startIdx + numChildren;
      deletedChildren = x.filter((e, idx) => idx >= startIdx && idx < endIdx);
      return _.difference(x, deletedChildren);
    });
    deleteSections({ sectionIds: deletedChildren });
  }
  return deleteChild;
}
