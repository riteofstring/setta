import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../classes/infoFactory";
import { KwargInfo } from "../classes/mutableInfo";
import { UIType } from "../classes/uiType";
import { createNewId } from "../utils/sectionIds";
import {
  curryAction,
  defaultState,
  insertIntoArrayOrXpend,
} from "../utils/utils";
import { useIdsOverview } from "./useIdsOverview";

function getInfo(x) {
  return x.x;
}

function getAttr(x, attr = null) {
  if (attr === null) {
    return x;
  }
  return x[attr];
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

  const createInfo = ({ name, uiType, uiTypeConfig, numChildren }) => {
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

export function useGetKwargIds(sectionId, objInfo) {
  return defaultState(
    useStoreState(
      (x) => getInfo(x.objInfos)[sectionId]?.[objInfo.id]?.kwargIds
    ),
    () => []
  );
}

export function useGetKwargInfos(sectionId, objInfo) {
  const kwargIds = useGetKwargIds(sectionId, objInfo);
  const kwargInfoState = useStoreState((x) => getInfo(x.kwargInfos));
  return kwargIds.map((x) => kwargInfoState[x]);
}

export function useGetAllParamInfos(sectionId, objInfo) {
  const objParamInfos = objInfo.children ? Object.values(objInfo.children) : [];
  const paramCollections = useGetParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

export function useGetAllParamAndKwargInfos(sectionId, objInfo) {
  return [
    ...useGetAllParamInfos(sectionId, objInfo),
    ...useGetKwargInfos(sectionId, objInfo),
  ];
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

export function useAddKwarg(sectionId, objInfo) {
  const setKwargInfo = useStoreActions((x) => x.kwargInfos.setKwargInfo);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  return () => {
    const kwargInfo = new KwargInfo(createNewId(), "", {});
    setKwargInfo({ kwargInfoId: kwargInfo.id, kwargInfo });
    setKwargIds({
      sectionId,
      objInfoId: objInfo.id,
      newStateFn: (x) => [...x, kwargInfo.id],
    });
  };
}

export function useDeleteKwarg(sectionId, objInfo) {
  const deleteChild = useDeleteChild(sectionId);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  const deleteKwargInfo = useStoreActions((x) => x.kwargInfos.deleteKwargInfo);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childIdFn = useParamChildId(sectionId);
  return (kwargInfo) => {
    const { id } = kwargInfo;
    const childId = childIdFn(id)[0];
    setKwargIds({
      sectionId,
      objInfoId: objInfo.id,
      newStateFn: (x) => x.filter((y) => y !== id),
    });
    deleteKwargInfo({ ids: [id] });
    deleteParamInfo({ ids: [id] });
    if (childId) {
      deleteChild({ startId: childId });
    }
  };
}

export function useAddChild(sectionId, parentIsSection = true, prepend = true) {
  const setIdsOverview = useIdsOverview(sectionId)[1];
  const setChildId = useStoreActions((x) => x.paramInfos.setChildId);
  const createInfo = useCreateSectionInfo(sectionId, parentIsSection);

  function addChild({
    name = null,
    uiType = null,
    uiTypeConfig = null,
    startId = null,
    numChildren = 1,
    parentParamInfoId = null,
  }) {
    const newIds = createInfo({ name, uiType, uiTypeConfig, numChildren });

    setIdsOverview((x) => {
      let insertIdx = null;
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, prepend, ...newIds);
    });

    if (parentParamInfoId) {
      setChildId({
        sectionId,
        paramInfoId: parentParamInfoId,
        childId: newIds[0],
      });
    }
  }

  return addChild;
}

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);

  function deleteChild({ startId = null, numChildren = 1 }) {
    if (idsOverview.length === 0) {
      return;
    }
    let startIdx = 0;
    if (startId !== null) {
      startIdx = idsOverview.indexOf(startId);
    }
    const endIdx = startIdx + numChildren;
    const newChildren = idsOverview.filter(
      (e, idx) => !(idx >= startIdx && idx < endIdx)
    );
    setIdsOverview((x) => newChildren);
    deleteSections({ sectionIds: _.difference(idsOverview, newChildren) });
  }
  return deleteChild;
}