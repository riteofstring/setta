import C from "constants/constants.json";
import _ from "lodash";
import { setParamEnteredValue } from "state/actions/paramInfos";
import { setSelectedItem } from "state/actions/setters";
import { useCodeInfo } from "state/definitions";
import { useEVCols } from "state/definitions";
import { useSectionInfos } from "state/definitions";
import { useSectionToParams } from "state/definitions/sectionToParams";
import { getSectionByName, getSectionType } from "state/getters/sectionInfo";

export function varControlUpdate() {
  const js_code = getVarControlSection()?.varControl;
  if (!js_code) {
    return;
  }
  const fn = new Function("state", "_", js_code);
  const newVals = fn(niceState(), _);
  console.log(newVals);
  for (const [k, v] of Object.entries(newVals)) {
    const split = k.split(".");
    if (split.length === 2) {
      const sectionName = split[0];
      const section = getSectionByName(sectionName);
      const paramName = split[1];
      const param = useSectionToParams
        .getState()
        .params[section.id].find((x) => x.name === paramName);
      setParamEnteredValue({
        sectionId: section.id,
        paramInfoId: param.id,
        value: v,
      });
    } else if (split.length === 1) {
      const sectionName = split[0];
      const section = getSectionByName(sectionName);
      if (!section) {
        const { globalVarSection, globalVar } = getGlobalVar(sectionName);
        if (globalVar) {
          setParamEnteredValue({
            sectionId: globalVarSection.id,
            paramInfoId: globalVar.id,
            value: v,
          });
        }
      } else {
        setSelectedItem(section.id, v, false);
      }
    }
  }
}

function niceState() {
  const output = {};
  for (const v of Object.values(useSectionInfos.getState().x)) {
    const sectionType = getSectionType(v.id).type;
    if ([C.CODE, C.VAR_CONTROL].includes(sectionType)) {
      continue;
    }
    if (sectionType === C.GLOBAL_VARIABLES) {
      for (const p of useSectionToParams.getState().params[v.id]) {
        output[p.name] = useEVCols.getState().x[v.evColId].values[p.id];
      }
    } else {
      output[v.name] = v.selectedItem
        ? useCodeInfo.getState().x[v.selectedItem].name
        : null;
    }
  }

  return output;
}

function getGlobalVarsSection() {
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (getSectionType(s.id).type === C.GLOBAL_VARIABLES) {
      return s;
    }
  }
  return null;
}

function getVarControlSection() {
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (getSectionType(s.id).type === C.VAR_CONTROL) {
      return s;
    }
  }
  return null;
}

function getGlobalVar(varName) {
  const globalVarSection = getGlobalVarsSection();
  if (!globalVarSection) {
    return { globalVarSection: null, globalVar: null };
  }
  return {
    globalVarSection,
    globalVar: useSectionToParams
      .getState()
      .params[globalVarSection.id].find((x) => x.name === varName),
  };
}
