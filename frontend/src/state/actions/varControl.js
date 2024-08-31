import C from "constants/constants.json";
import {
  useCodeInfo,
  useNodeInternals,
  useSectionInfos,
  useSectionToParams,
} from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { getNodes } from "./nodeInternals";
import { getParamInfos } from "./sections/sectionContents";
import { getParamEV, getSectionSelectedItem } from "./sectionVariants";

export function varControlUpdate() {
  console.log("niceState()", niceState());
  // const js_code = getVarControlSection()?.varControl;
  // if (!js_code) {
  //   return;
  // }
  // const fn = new Function("state", "_", js_code);
  // const newVals = fn(niceState(), _);
  // console.log(newVals);
  // for (const [k, v] of Object.entries(newVals)) {
  //   const split = k.split(".");
  //   if (split.length === 2) {
  //     const sectionName = split[0];
  //     const section = getSectionByName(sectionName);
  //     const paramName = split[1];
  //     const param = useSectionToParams
  //       .getState()
  //       .params[section.id].find((x) => x.name === paramName);
  //     setParamEnteredValue({
  //       sectionId: section.id,
  //       paramInfoId: param.id,
  //       value: v,
  //     });
  //   } else if (split.length === 1) {
  //     const sectionName = split[0];
  //     const section = getSectionByName(sectionName);
  //     if (!section) {
  //       const { globalVarSection, globalVar } = getGlobalVar(sectionName);
  //       if (globalVar) {
  //         setParamEnteredValue({
  //           sectionId: globalVarSection.id,
  //           paramInfoId: globalVar.id,
  //           value: v,
  //         });
  //       }
  //     } else {
  //       setSelectedItem(section.id, v, false);
  //     }
  //   }
  // }
}

function niceState() {
  const output = {};
  const topLevelSectionIds = useNodeInternals.getState().x.keys()
  for (const v of getNodes()) {
    const sectionType = getSectionType(v.id).type;
    if ([C.CODE, C.VAR_CONTROL].includes(sectionType)) {
      continue;
    }
    if (sectionType === C.GLOBAL_VARIABLES) {
      for (const p of getParamInfos(v.id)) {
        output[p.name] = getParamEV(v.id, p.id);
      }
    } else if (sectionType === C.SECTION) {
      const selectedItem = getSectionSelectedItem(v.id);
      output[v.name] = {};
      output[v.name]["selectedItem"] = selectedItem
        ? useCodeInfo.getState().x[selectedItem].name
        : null;
      output[v.name]["params"] = {};
      for (const p of getParamInfos(v.id)) {
        output[v.name]["params"][p.name] = getParamEV(v.id, p.id);
      }
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
