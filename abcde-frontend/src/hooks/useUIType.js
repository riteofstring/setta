import { UIType } from "classes/uiType";
import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";
import { createNewId } from "utils/utils";
import { defaultState, nullOrUndefined } from "utils/utils";

import {
  DEFAULT_DEFAULT_UI_TYPE_ID,
  isRoot,
  rootTypeToChildType,
  SECTION,
  SET_FROM_SIDEPANE,
} from "../utils/constants";
import { useParamUITypeId } from "./useParamInfo";
import { useSetSectionUITypeId } from "./useSectionInfo";
import { getInfo } from "./utils";

export function useGetParamUIType(sectionId) {
  const uiTypeIdFn = useParamUITypeId(sectionId);
  return (paramInfoId) => {
    const uiTypeId = uiTypeIdFn(paramInfoId)[0];
    return defaultState(
      useStoreState((x) => getInfo(x.uiTypes)[uiTypeId]),
      () => ({})
    );
  };
}

function useSetUITypeConfig(defaultName, uiType, settingPreset, setUITypeId) {
  const setConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  return (props) => {
    // If it's a preset but we're not "saving as", then
    // copy into a non-preset ui type.
    let maybeNewUIType = uiType;
    if (uiType.isPreset && !settingPreset) {
      maybeNewUIType = cloneNewUIType({ uiType, name: defaultName });
      setUIType({ uiType: maybeNewUIType });
      setUITypeId(maybeNewUIType.id);
    }
    setConfig({ uiTypeId: maybeNewUIType.id, ...props });
  };
}

function useSetNewIdDeleteOld(currUIType, setUITypeId) {
  const deleteUIType = useStoreActions((x) => x.uiTypes.deleteUIType);
  return (newId) => {
    setUITypeId(newId);
    if (!currUIType.isPreset) {
      deleteUIType({ uiTypeId: currUIType.id });
    }
  };
}

export function useSetSectionUIType(
  sectionId,
  sectionName,
  parentId,
  paramInfoId,
  currUIType,
  settingPreset = false
) {
  const setParamUITypeId = useParamUITypeId(parentId)(paramInfoId)[1];
  const setSectionUITypeId = useSetSectionUITypeId(sectionId);
  const setUITypeConfig = useSetUITypeConfig(
    sectionName,
    currUIType,
    settingPreset,
    setSectionUITypeId
  );

  const setUITypeId = useSetNewIdDeleteOld(currUIType, setSectionUITypeId);
  const _setUITypeId = (newId) => {
    setUITypeId(newId);
    if (paramInfoId) {
      setParamUITypeId(newId);
    }
  };

  return [_setUITypeId, setUITypeConfig];
}

export function useSetParamUIType(
  sectionId,
  paramInfoId,
  paramInfoName,
  paramInfoChildId,
  currUIType,
  settingPreset = false
) {
  const setParamUITypeId = useParamUITypeId(sectionId)(paramInfoId)[1];
  const setSectionUITypeId = useSetSectionUITypeId(paramInfoChildId);
  const setUITypeConfig = useSetUITypeConfig(
    paramInfoName,
    currUIType,
    settingPreset,
    setParamUITypeId
  );
  const setUITypeId = useSetNewIdDeleteOld(currUIType, setParamUITypeId);

  const _setUITypeId = (newId) => {
    setUITypeId(newId);
    if (paramInfoChildId) {
      setSectionUITypeId(newId);
    }
  };
  return [_setUITypeId, setUITypeConfig];
}

export function useProjectDefaultUIType(paramInfoId) {
  const uiTypeId = useStoreState(
    (x) => x.projectParamDefaults.x[paramInfoId]?.uiTypeId
  );
  return useStoreState((x) => x.uiTypes.x[uiTypeId]);
}

export function useGlobalDefaultUIType(paramType) {
  const uiTypeId = useStoreState(
    (x) => x.globalParamDefaults.x[paramType]?.uiTypeId
  );
  return useStoreState((x) => x.uiTypes.x[uiTypeId]);
}

export function getNewUIType({ id, ...props }) {
  return new UIType({
    id: id ? id : createNewId(),
    ...props,
  });
}

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  origin = SET_FROM_SIDEPANE,
  isPreset = false,
}) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.origin = origin;
  newUIType.isPreset = isPreset;
  if (!nullOrUndefined(config)) {
    newUIType.config = config;
  }
  return newUIType;
}

export function useInitializeUIType(sectionId) {
  const uiTypeFn = useParamUITypeId(sectionId);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  return (paramInfo) => {
    const [uiTypeId, setUITypeId] = uiTypeFn(paramInfo.id);
    const projectDefaultUIType = useProjectDefaultUIType(paramInfo.id);
    const globalDefaultUIType = useGlobalDefaultUIType(paramInfo.type);
    return () => {
      if (uiTypeId) {
        return;
      } else if (projectDefaultUIType) {
        setUITypeId(projectDefaultUIType.id);
      } else if (globalDefaultUIType) {
        setUITypeId(globalDefaultUIType.id);
      } else {
        setUITypeId(DEFAULT_DEFAULT_UI_TYPE_ID);
      }
    };
  };
}

export function useSetUITypeDirect(uiTypeCollectionId, paramInfoId) {
  const uiTypeId = useStoreState(
    (x) => x.paramInfos.y[uiTypeCollectionId]?.[paramInfoId]?.uiTypeId
  );
  const setOneConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  return [uiTypeId, setOneConfig];
}

export function cloneRootUIType(parentUIType) {
  const uiType = _.cloneDeep(parentUIType);
  uiType.id = createNewId();
  uiType.type = SECTION;
  uiType.config.subType = rootTypeToChildType[parentUIType.type];
  uiType.isPreset = false;
  return uiType;
}

export function getChildUITypeId(parentUIType, setUIType, setOneConfig) {
  const { childUITypeId } = parentUIType.config;
  if (childUITypeId) {
    return childUITypeId;
  }
  const newUIType = cloneRootUIType(parentUIType);
  const id = newUIType.id;
  setOneConfig({
    uiTypeId: parentUIType.id,
    configName: "childUITypeId",
    newValueFn: () => id,
  });
  setUIType({ uiType: newUIType });
  return id;
}

export function useGetChildUITypeId() {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const setOneConfig = useStoreActions((x) => x.uiTypes.setOneConfig);

  return (uiTypeId, parentUIType) => {
    if (uiTypeId) {
      return uiTypeId;
    }
    if (isRoot(parentUIType.type)) {
      return getChildUITypeId(parentUIType, setUIType, setOneConfig);
    }
    const newUIType = getNewUIType();
    setUIType({ uiType: newUIType });
    return newUIType.id;
  };
}
