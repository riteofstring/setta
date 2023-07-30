import { requiresNestedSection } from "abcde-utils/src/constants";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo } from "./sections/getters";
import { maybeIncrementProjectStateVersion } from "./undo";

export function getParamEVId(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().x[evColId][paramInfoId];
}

export function getParamEV(sectionId, paramInfoId) {
  const evId = getParamEVId(sectionId, paramInfoId);
  return useEnteredValues.getState().x[evId];
}

export function getParamChildId(sectionId: string, paramInfoId: string) {
  const s = useSectionInfos.getState().x;
  const possibleChildren = s[sectionId].children;
  for (const c of possibleChildren) {
    if (s[c].paramInfoId === paramInfoId) {
      return c;
    }
  }
  return null;
}

export function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().y[uiTypeColId][paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}

export function getParamIsNested(sectionId, paramInfoId) {
  const uiType = getParamUIType(sectionId, paramInfoId);
  return requiresNestedSection(uiType.type);
}

export function getAllEVsWithUIType(uiTypeId) {
  const state = useParamInfos.getState();
  const evIds: string[] = [];
  for (const [colId, col] of Object.entries(state.y)) {
    const paramsWithUITypeId = new Set();
    for (const [pid, p] of Object.entries(col)) {
      if (p.uiTypeId === uiTypeId) {
        paramsWithUITypeId.add(pid);
      }
    }
    if (paramsWithUITypeId.size === 0) {
      continue;
    }

    for (const s of Object.values(useSectionInfos.getState().x)) {
      if (s.uiTypeColId === colId) {
        for (const [pid, evid] of Object.entries(state.x[s.evColId])) {
          if (paramsWithUITypeId.has(pid)) {
            evIds.push(evid);
          }
        }
      }
    }
  }

  return evIds;
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const evId = getParamEVId(sectionId, paramInfoId);
  useEnteredValues.getState().setEnteredValue({ enteredValueId: evId, value });
  maybeIncrementProjectStateVersion(incrementVersion);
}
