import { createSectionInfo } from "classes/infoFactory";
import { UIType } from "classes/uiType";
import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";
import { createNewId } from "utils/sectionIds";
import { curryAction, defaultState } from "utils/utils";

import { DEFAULT_UI_TYPE_NAME } from "../utils/constants";

function getInfo(x) {
  return x.x;
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

function useSetUITypeAttr(sectionId, paramInfoId, uiType, settingDefault) {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const setUITypeId = useParamUITypeId(sectionId)(paramInfoId)[1];
  return (fn, props) => {
    // The uitype comes from a project or user settings default
    // But it's being changed from the sidepane
    let maybeNewUIType = uiType;
    if (uiType.isDefault && !settingDefault) {
      maybeNewUIType = cloneNewUIType(uiType);
      setUIType({ uiType: maybeNewUIType });
      setUITypeId(maybeNewUIType.id);
    }
    fn({ uiTypeId: maybeNewUIType.id, ...props });
  };
}

export function useSetUIType(
  sectionId,
  paramInfoId,
  uiType,
  settingDefault = false
) {
  const setUITypeAttr = useSetUITypeAttr(
    sectionId,
    paramInfoId,
    uiType,
    settingDefault
  );
  const setName = useStoreActions((x) => x.uiTypes.setName);
  const setConfig = useStoreActions((x) => x.uiTypes.setOneConfig);

  const _setName = (props) => {
    setUITypeAttr(setName, props);
  };
  const _setConfig = (props) => {
    setUITypeAttr(setConfig, props);
  };
  return [_setName, _setConfig];
}

export function useProjectDefaultUIType(paramInfoId) {
  const uiTypeId = useStoreState(
    (x) => x.paramDefaults.x[paramInfoId]?.uiTypeId
  );
  return useStoreState((x) => x.uiTypes.x[uiTypeId]);
}

export function useSettingsDefaultUITypeName(type) {
  const defaultUITypeName = useStoreState(
    (x) => x.userSettings.datatypeToUIType[type]
  );
  return defaultUITypeName ? defaultUITypeName : DEFAULT_UI_TYPE_NAME;
}

export function getNewUIType({ id, ...props }) {
  return new UIType({
    id: id ? id : createNewId(),
    ...props,
  });
}

export function cloneNewUIType(uiType, isDefault = false) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.isDefault = isDefault;
  return newUIType;
}

export function useInitializeUIType(sectionId) {
  const uiTypeFn = useParamUITypeId(sectionId);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  return (paramInfo) => {
    const [uiTypeId, setUITypeId] = uiTypeFn(paramInfo.id);
    const projectDefaultUIType = useProjectDefaultUIType(paramInfo.id);
    const settingsDefaulUITypeName = useSettingsDefaultUITypeName(
      paramInfo.type
    );
    return () => {
      if (uiTypeId) {
        return;
      } else if (projectDefaultUIType) {
        setUITypeId(projectDefaultUIType.id);
      } else {
        const newUIType = getNewUIType({ name: settingsDefaulUITypeName });
        setUITypeId(newUIType.id);
        setUIType({ uiType: newUIType });
      }
    };
  };
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
    const newUITypes = needsNewUIType.map((x) => getNewUIType());
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
