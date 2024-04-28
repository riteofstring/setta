import {
  getSectionType,
  hasParentInFlattenedStructure,
} from "thunks/sections/getters";
import { getParamInfos } from "thunks/sections/sectionContents";
import { SINGLETON_SECTIONS } from "utils/constants";
import { LIST } from "z_utils/constants";
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
    (x) => !hasParentInFlattenedStructure(x),
  );
  const names = [];
  const fullNameToInfo = {};
  const sectionState = useSectionInfos.getState().x;
  for (const sid of topLevelIds) {
    if (SINGLETON_SECTIONS.globalVariables === sid) {
      for (const p of getParamInfos(sid)) {
        if (!p.name) {
          continue;
        }
        const escaped = escapeRegExp(p.name);
        names.push(escaped);
        fullNameToInfo[escaped] = {
          id: sid,
          componentIndices: [escaped.length],
        };
      }
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

export function isArgsVar(x) {
  return x.startsWith(ARGS_PREFIX);
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
    const currComponentName = subType === LIST ? name : `["${name}"]`;
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
  allNames.push(escapeRegExp(fullName), escapeRegExp(argsFullName));
  fullNameToInfo[fullName] = { id: sectionId, componentIndices: parentLengths };
  fullNameToInfo[argsFullName] = {
    id: sectionId,
    componentIndices: parentLengths.map((x) => x + ARGS_PREFIX.length),
  };
}

// function getFullParamRegex(
//   sectionId,
//   fullNameToId,
//   fullNameToComponentIdx,
//   parentName,
//   parentLengths,
// ) {
//   const output = [];
//   for (const p of getParamInfos(sectionId)) {
//     if (!p.name) {
//       continue;
//     }
//     const fullName = `${parentName}["${p.name}"]`;
//     const escaped = escapeRegExp(fullName);
//     output.push(escaped);
//     fullNameToId[escaped] = sid;
//     fullNameToComponentIdx[fullName] = parentLengths;
//   }
// }
