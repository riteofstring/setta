import { createSectionInfo } from "classes/infoFactory";
import { KwargInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";
import { createNewId } from "utils/sectionIds";
import { curryAction, defaultState, insertIntoArrayOrXpend } from "utils/utils";

import { getDefaultUIType } from "../utils/constants";
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
  sectionTypeName,
  numChildren,
  parentSectionInfo,
  parentSectionType,
  sectionSpecs,
  setSectionInfo,
  setSectionType,
}) {
  const newInfos = {};
  const newSectionTypes = {};
  for (let i = 0; i < numChildren; i++) {
    const infoFactoryOutput = createSectionInfo(
      name,
      sectionTypeName,
      parentSectionInfo,
      parentSectionType,
      sectionSpecs
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

  const createInfo = ({ name, sectionTypeName, sectionSpecs, numChildren }) => {
    return createSectionInfoFn({
      name,
      sectionTypeName,
      numChildren,
      parentSectionInfo,
      parentSectionType,
      sectionSpecs,
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

export function useGetManySectionTypeNames(sectionIds) {
  const sectionTypeIds = useStoreState(
    (x) => sectionIds.map((y) => getInfo(x.sectionInfos)[y]?.sectionTypeId),
    _.isEqual
  );
  return useStoreState(
    (x) => sectionTypeIds.map((y) => getInfo(x.sectionTypes)[y]?.name),
    _.isEqual
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

export function getXInfos(collectionIds, allCollections, infoId = null) {
  const collections = collectionIds.map((x) => allCollections.children[x]);
  const output = _.merge({}, ...collections.map((x) => x.children));
  if (infoId) {
    return output[infoId];
  }
  return Object.values(output);
}

export function useGetXInfosFromSection(
  collectionName,
  allCollectionName,
  sectionId,
  infoId = null
) {
  const allCollections = useStoreState((x) => x.master[allCollectionName]);
  const sectionType = useGetSectionType(sectionId);
  if (sectionId) {
    const collectionIds = sectionType[collectionName];
    return getXInfos(collectionIds, allCollections, infoId);
  }
  return [];
}

export function useGetObjInfos(sectionId, infoId = null) {
  return useGetXInfosFromSection(
    "objCollectionIds",
    "allObjCollections",
    sectionId,
    infoId
  );
}

export function useGetParamCollections(sectionId, infoId = null) {
  return useGetXInfosFromSection(
    "paramCollectionIds",
    "allParamCollections",
    sectionId,
    infoId
  );
}

export function useGetKwargIds(sectionId, objInfo) {
  const { kwargCollectionId } = useGetSectionInfo(sectionId);
  return defaultState(
    useStoreState(
      (x) => getInfo(x.objInfos)[kwargCollectionId]?.[objInfo.id]?.kwargIds
    ),
    () => []
  );
}

export function useGetKwargInfos(sectionId, objInfo) {
  const kwargIds = useGetKwargIds(sectionId, objInfo);
  const kwargInfoState = useStoreState(
    (x) => kwargIds.map((y) => getInfo(x.kwargInfos)[y]),
    _.isEqual
  );
  return kwargInfoState;
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
  collectionId,
  stateName,
  setStateFn,
  key,
  attr
) {
  return (paramInfoId) => {
    const setX = curryAction(
      useStoreActions((x) => x.paramInfos[setStateFn]),
      { collectionId }
    );
    const x = useStoreState(
      (x) => x.paramInfos[attr][collectionId]?.[paramInfoId]?.[stateName]
    );
    const setX_ = curryAction(setX, { paramInfoId }, key);
    return [x, setX_];
  };
}

export function useParamWithParamCollectionId(
  sectionId,
  stateName,
  setStateFn,
  key
) {
  const { paramCollectionId } = useGetSectionInfo(sectionId);
  return useParamInfoState(paramCollectionId, stateName, setStateFn, key, "x");
}

export function useParamWithUITypeCollectionId(
  sectionId,
  stateName,
  setStateFn,
  key
) {
  const { uiTypeCollectionId } = useGetSectionType(sectionId);
  return useParamInfoState(uiTypeCollectionId, stateName, setStateFn, key, "y");
}

export function useParamEnteredValueId(sectionId) {
  return useParamWithParamCollectionId(
    sectionId,
    "enteredValueId",
    "setEnteredValueId",
    "enteredValueId"
  );
}

export function useParamChildId(sectionId) {
  return useParamWithParamCollectionId(
    sectionId,
    "childId",
    "setChildId",
    "childId"
  );
}

export function useParamUITypeId(sectionId) {
  return useParamWithUITypeCollectionId(
    sectionId,
    "uiTypeId",
    "setUITypeId",
    "uiTypeId"
  );
}

export function useGetManyParamsWithParamCollectionId(
  sectionId,
  paramInfos,
  key
) {
  const { paramCollectionId } = useGetSectionInfo(sectionId);
  return useStoreState(
    (x) =>
      paramInfos.map((y) => x.paramInfos.x[paramCollectionId]?.[y.id]?.[key]),
    _.isEqual
  );
}

export function useGetManyParamsWithUITypeCollectionId(
  sectionId,
  paramInfos,
  key
) {
  const { uiTypeCollectionId } = useGetSectionType(sectionId);
  return useStoreState(
    (x) =>
      paramInfos.map((y) => x.paramInfos.y[uiTypeCollectionId]?.[y.id]?.[key]),
    _.isEqual
  );
}

export function useInitializeEnteredValue(sectionId) {
  const enteredValueIdFn = useParamEnteredValueId(sectionId);
  const setEnteredValue = useStoreActions(
    (x) => x.enteredValues.setEnteredValue
  );
  return (paramInfo) => {
    const [enteredValueId, setEnteredValueId] = enteredValueIdFn(paramInfo.id);
    return () => {
      if (!enteredValueId) {
        const newId = createNewId();
        setEnteredValueId(newId);
        setEnteredValue({ enteredValueId: newId, value: "" });
      }
    };
  };
}

export function useParamEnteredValue(sectionId) {
  const enteredValueIdFn = useParamEnteredValueId(sectionId);
  return (paramInfo) => {
    const enteredValueId = enteredValueIdFn(paramInfo.id)[0];
    const enteredValue = defaultState(
      useStoreState((x) => getInfo(x.enteredValues)[enteredValueId]),
      () => ""
    );
    const setEnteredValue = curryAction(
      useStoreActions((x) => x.enteredValues.setEnteredValue),
      { enteredValueId },
      "value"
    );
    return [enteredValue, setEnteredValue];
  };
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

export function useSetUITypeConfig(uiType) {
  const x = useStoreActions((x) => x.uiTypes.setOneConfig);
  const setUITypeConfig = ({ configName, newValueFn }) => {
    x({ uiTypeId: uiType.id, configName, newValueFn });
  };
  return setUITypeConfig;
}

export function useGetDefaultUITypeName(paramInfo) {
  const { uiTypeName, type } = paramInfo;
  const defaultUITypeName = useStoreState(
    (x) => x.userSettings.datatypeToUIType[type]
  );
  return defaultUITypeName ? defaultUITypeName : getDefaultUIType(uiTypeName);
}

export function getNewUIType(paramInfo, uiTypeName) {
  const config = Object.assign({}, paramInfo.uiTypeConfig);
  return new UIType({
    id: createNewId(),
    name: uiTypeName,
    config: config,
  });
}

export function useInitializeUIType(sectionId) {
  const uiTypeFn = useParamUITypeId(sectionId);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  return (paramInfo) => {
    const [uiTypeId, setUITypeId] = uiTypeFn(paramInfo.id);
    const uiTypeName = useGetDefaultUITypeName(paramInfo);
    return () => {
      if (!uiTypeId) {
        const newUIType = getNewUIType(paramInfo, uiTypeName);
        setUITypeId(newUIType.id);
        setUIType({ uiTypeId: newUIType.id, uiType: newUIType });
      }
    };
  };
}

export function useAddKwarg(sectionId, objInfo) {
  const { kwargCollectionId } = useGetSectionInfo(sectionId);
  const setKwargInfo = useStoreActions((x) => x.kwargInfos.setKwargInfo);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  return () => {
    const kwargInfo = new KwargInfo({ id: createNewId(), name: "" }, null);
    setKwargInfo({ kwargInfoId: kwargInfo.id, kwargInfo });
    setKwargIds({
      collectionId: kwargCollectionId,
      objInfoId: objInfo.id,
      newStateFn: (x) => [...x, kwargInfo.id],
    });
  };
}

export function useDeleteKwarg(sectionId, objInfo) {
  const { paramCollectionId, kwargCollectionId } = useGetSectionInfo(sectionId);
  const { uiTypeCollectionId } = useGetSectionType(sectionId);
  const deleteChild = useDeleteChild(sectionId);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  const deleteKwargInfo = useStoreActions((x) => x.kwargInfos.deleteKwargInfo);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childIdFn = useParamChildId(sectionId);
  return (kwargInfo) => {
    const { id } = kwargInfo;
    const childId = childIdFn(id)[0];
    return () => {
      setKwargIds({
        collectionId: kwargCollectionId,
        objInfoId: objInfo.id,
        newStateFn: (x) => x.filter((y) => y !== id),
      });
      deleteKwargInfo({ ids: [id] });
      deleteParamInfo({ paramCollectionId, uiTypeCollectionId, ids: [id] });
      if (childId) {
        deleteChild({ startId: childId });
      }
    };
  };
}

export function useAddChild(sectionId) {
  const { paramCollectionId: collectionId } = useGetSectionInfo(sectionId);
  const setIdsOverview = useSetIdsOverview(sectionId);
  const setChildId = useStoreActions((x) => x.paramInfos.setChildId);
  const createInfo = useCreateSectionInfo(sectionId);

  function addChild({
    name = null,
    sectionTypeName = null,
    sectionSpecs = null,
    numChildren = 1,
    parentParamInfoId = null,
    startId = null,
  }) {
    const newIds = createInfo({
      name,
      sectionTypeName,
      sectionSpecs,
      numChildren,
    });

    setIdsOverview((x) => {
      let insertIdx = null;
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, true, ...newIds);
    });

    if (parentParamInfoId) {
      setChildId({
        collectionId,
        paramInfoId: parentParamInfoId,
        childId: newIds[0],
      });
    }
  }

  return addChild;
}

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const setIdsOverview = useSetIdsOverview(sectionId);

  function deleteChild({ numChildren = 1, startId = null }) {
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

export function useReinitSectionType(sectionId) {
  const reinitSectionType = useStoreActions(
    (x) => x.sectionTypes.reinitSectionType
  );
  const allParamCollections = useStoreState(
    (x) => x.master["allParamCollections"]
  );
  const { id: sectionTypeId, uiTypeCollectionId } =
    useGetSectionType(sectionId);
  const existingUITypeIds = defaultState(
    useStoreState((x) => x.paramInfos.y[uiTypeCollectionId]),
    () => ({})
  );
  const setManyUITypeIds = useStoreActions(
    (x) => x.paramInfos.setManyUITypeIds
  );
  const setManyUITypes = useStoreActions((x) => x.uiTypes.setManyUITypes);

  return (props) => {
    const { paramCollectionIds } = reinitSectionType({
      sectionTypeId,
      ...props,
    });
    // The following code is to address the problem that arises
    // when multiple sections get populated with a paramCollection.
    // Without this, they will end up making unused uiTypes.
    const paramInfos = getXInfos(paramCollectionIds, allParamCollections);
    const needsNewUIType = paramInfos.filter((x) => !existingUITypeIds[x.id]);
    const newUITypes = needsNewUIType.map((x) => getNewUIType(x));
    const paramInfoIds = needsNewUIType.map((x) => x.id);
    const newUITypeIds = newUITypes.map((x) => x.id);
    setManyUITypeIds({
      collectionId: uiTypeCollectionId,
      paramInfoIds,
      uiTypeIds: newUITypeIds,
    });
    setManyUITypes({ uiTypes: newUITypes });
  };
}

export function useSectionGroups(returnAsMapping = false) {
  const groupIds = useStoreState((x) => x.master.groupIds);
  const setGroupIds = useStoreActions((x) => x.master.setGroupIds);
  let groups = useStoreState(
    (x) => _.compact(groupIds.map((y) => x.master.groupChildren[y])),
    _.isEqual
  );
  if (returnAsMapping) {
    groups = _.zipObject(groupIds, groups);
  }
  return { groupIds, setGroupIds, groups };
}

export function useGroupsHaveUpdated() {
  const groupsHaveUpdated = useStoreState((x) => x.master.groupsHaveUpdated);
  const setGroupsHaveUpdated = useStoreActions(
    (x) => x.master.setGroupsHaveUpdated
  );
  return [groupsHaveUpdated, setGroupsHaveUpdated];
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
