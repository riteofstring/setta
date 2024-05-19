import _ from "lodash";
import {
  getSectionType,
  hasParentInFlattenedStructure,
} from "thunks/sections/getters";
import { getParamInfos } from "thunks/sections/sectionContents";
import { C, SINGLETON_SECTIONS } from "utils/constants";
import { create } from "../utils";
import { useSectionInfos } from "./sectionInfos";

const ARGS_PREFIX = "__";

export const useKeywordRegex = create((set) => ({
  pattern: "",
  fullNameToInfo: {},
  update: (sectionIdsToNames) => set(getRegexAndColorMap(sectionIdsToNames)),
  updateGlobalVariables: (globalVariableId) => {
    if (globalVariableId) {
      set(getRegexAndColorMap({ [globalVariableId]: null }));
    }
  },
}));

function getRegexAndColorMap(sectionIdsToNames) {
  const topLevelIds = Object.keys(sectionIdsToNames).filter(
    (x) =>
      !hasParentInFlattenedStructure(x) &&
      [C.GLOBAL_VARIABLES, C.SECTION, C.LIST_ROOT, C.DICT_ROOT].includes(
        getSectionType(x).type,
      ),
  );
  const names = [];
  const fullNameToInfo = {};
  const sectionState = useSectionInfos.getState().x;
  for (const sid of topLevelIds) {
    if (SINGLETON_SECTIONS.globalVariables === sid) {
      setFullParamRegex(sid, names, fullNameToInfo, "", [], true);
    } else {
      const currName = sectionIdsToNames[sid];
      setFullChildrenNamesForRegex(
        sectionState,
        sectionIdsToNames,
        names,
        fullNameToInfo,
        sid,
        currName,
        [currName.length],
      );
    }
  }

  const pattern = new RegExp(
    `(?<![A-Za-z."'_])(${names.join("|")})(?![A-Za-z"'_])`,
    "g",
  );

  return { pattern, fullNameToInfo };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setFullChildrenNamesForRegex(
  sectionState,
  sectionIdsToNames,
  allNames,
  fullNameToInfo,
  sectionId,
  parentName,
  parentLengths,
) {
  for (const c of sectionState[sectionId].children) {
    const subType = getSectionType(c).config.subType;
    const name = sectionIdsToNames[c];
    const currComponentName = subType === C.LIST ? name : `["${name}"]`;
    const currFullName = `${parentName}${currComponentName}`;
    setFullChildrenNamesForRegex(
      sectionState,
      sectionIdsToNames,
      allNames,
      fullNameToInfo,
      c,
      currFullName,
      [...parentLengths, currFullName.length],
    );
  }
  const fullName = parentName;
  const argsFullName = `${ARGS_PREFIX}${parentName}`;
  const argsParentLengths = parentLengths.map((x) => x + ARGS_PREFIX.length);
  setFullParamRegex(
    sectionId,
    allNames,
    fullNameToInfo,
    argsFullName,
    argsParentLengths,
  );
  allNames.push(escapeRegExp(fullName), escapeRegExp(argsFullName));
  fullNameToInfo[fullName] = {
    sectionId,
    paramInfoId: null,
    componentIndices: parentLengths,
    isArgsObj: false,
  };
  fullNameToInfo[argsFullName] = {
    sectionId,
    paramInfoId: null,
    componentIndices: argsParentLengths,
    isArgsObj: true,
  };
}

function setFullParamRegex(
  sectionId,
  allNames,
  fullNameToInfo,
  parentName,
  parentLengths,
  isGlobalVar = false,
) {
  for (const p of getParamInfos(sectionId)) {
    if (!p.name) {
      continue;
    }
    const fullName = isGlobalVar ? p.name : `${parentName}["${p.name}"]`;
    allNames.push(escapeRegExp(fullName));
    fullNameToInfo[fullName] = {
      sectionId,
      paramInfoId: p.id,
      componentIndices: [...parentLengths, fullName.length],
      isArgsObj: false,
    };
  }
}

export function updateKeywordRegex() {
  useKeywordRegex
    .getState()
    .update(_.mapValues(useSectionInfos.getState().x, (v) => v.name));
}
