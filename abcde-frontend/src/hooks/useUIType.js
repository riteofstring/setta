import { UIType } from "classes/uiType";
import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";
import { createNewId } from "utils/sectionIds";
import { defaultState } from "utils/utils";

import { DEFAULT_UI_TYPE_NAME } from "../utils/constants";
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

export function useSetUITypeDirect(uiTypeCollectionId, paramInfoId) {
  const uiTypeId = useStoreState(
    (x) => x.paramInfos.y[uiTypeCollectionId]?.[paramInfoId]?.uiTypeId
  );
  const setOneConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  return [uiTypeId, setOneConfig];
}
