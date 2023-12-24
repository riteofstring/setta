import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useSectionToParams } from "models/info/sectionToParams";
import { setParamEnteredValue } from "thunks/paramInfos";
import { getSectionByName, getSectionType } from "thunks/sections/getters";
import { setSelectedItem } from "thunks/sections/setters";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { CODE, GLOBAL_VARIABLES, SCRIPT } from "z_utils/constants";

export function TestButton() {
  return <MenuBarButton onClick={onClick}>{"Test"}</MenuBarButton>;
}

function onClick() {
  const fn = new Function("state", "_", JAVASCRIPT_CODE);
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
    if ([CODE, SCRIPT].includes(sectionType)) {
      continue;
    }
    if (sectionType === GLOBAL_VARIABLES) {
      for (const p of useSectionToParams.getState().params[v.id]) {
        output[p.name] = useParamInfos.getState().x[v.evColId].values[p.id];
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
    if (getSectionType(s.id).type === GLOBAL_VARIABLES) {
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

const JAVASCRIPT_CODE = `
const newState = {}
// if (state.algorithm === "sklearn.cluster.kmeans_plusplus"){
//     newState.dataset = "torch.nn.CrossEntropyLoss"
// }
if (_.isNumber(_.toNumber(state.n_samples))){
    newState.n_clusters = _.toString(_.toNumber(state.n_samples)*3)
}
newState["dataset.n_samples"] = state.n_samples
return newState
`;
