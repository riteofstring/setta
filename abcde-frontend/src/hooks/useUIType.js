import { UIType } from "classes/uiType";
import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";
import { createNewId } from "utils/sectionIds";
import { defaultState, nullOrUndefined } from "utils/utils";

import {
  DEFAULT_DEFAULT_UI_TYPE_ID,
  SET_FROM_SIDEPANE,
} from "../utils/constants";
import { useParamUITypeId } from "./useParamInfo";
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

function useSetUITypeAttr(paramInfoName, uiType, settingPreset, setUITypeId) {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  return (fn, props) => {
    // If it's a preset but we're not "saving as", then
    // copy into a non-preset ui type.
    let maybeNewUIType = uiType;
    if (uiType.isPreset && !settingPreset) {
      maybeNewUIType = cloneNewUIType({ uiType, name: paramInfoName });
      setUIType({ uiType: maybeNewUIType });
      setUITypeId(maybeNewUIType.id);
    }
    fn({ uiTypeId: maybeNewUIType.id, ...props });
  };
}

export function useSetUIType(
  sectionId,
  paramInfoId,
  paramInfoName,
  currUIType,
  settingPreset = false
) {
  const setUITypeId = useParamUITypeId(sectionId)(paramInfoId)[1];
  const setConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  const deleteUIType = useStoreActions((x) => x.uiTypes.deleteUIType);
  const setUITypeAttr = useSetUITypeAttr(
    paramInfoName,
    currUIType,
    settingPreset,
    setUITypeId
  );

  const _setUITypeId = (newId) => {
    setUITypeId(newId);
    if (!currUIType.isPreset) {
      deleteUIType({ uiTypeId: currUIType.id });
    }
  };

  const _setConfig = (props) => {
    setUITypeAttr(setConfig, props);
  };
  return [_setUITypeId, _setConfig];
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
  name,
  origin = SET_FROM_SIDEPANE,
  isPreset = false,
}) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.origin = origin;
  newUIType.isPreset = isPreset;
  if (!nullOrUndefined(name)) {
    newUIType.name = name;
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

export function usePresetUIType(uiTypeId) {
  const uiType = useStoreState((x) => x.uiTypes.x[uiTypeId]);
  const setConfig = useStoreActions((x) => x.uiTypes.setConfig);
  const _setConfig = (newConfig) => {
    setConfig({ uiTypeId, newStateFn: (x) => ({ ...x, ...newConfig }) });
  };

  return [uiType, _setConfig];
}
