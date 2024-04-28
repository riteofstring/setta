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
  fullNameToId: {},
  fullNameToComponentIdx: {},
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
  const fullNameToId = {};
  const fullNameToComponentIdx = {};
  const sectionState = useSectionInfos.getState().x;
  for (const sid of topLevelIds) {
    if (SINGLETON_SECTIONS.globalVariables === sid) {
      for (const p of getParamInfos(sid)) {
        if (!p.name) {
          continue;
        }
        const escaped = escapeRegExp(p.name);
        names.push(escaped);
        fullNameToId[escaped] = sid;
        fullNameToComponentIdx[escaped] = [escaped.length];
      }
    } else {
      const currName = sectionIdsToNames[sid];
      const childrenNames = getFullChildrenNamesForRegex(
        sectionState,
        sectionIdsToNames,
        fullNameToId,
        fullNameToComponentIdx,
        sid,
        currName,
        [currName.length],
      );
      names.push(...childrenNames);
    }
  }

  const pattern = new RegExp(
    `(?<![A-Za-z."'_])(${names.join("|")})(?![A-Za-z"'_])`,
    "g",
  );

  return { pattern, fullNameToId, fullNameToComponentIdx };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isArgsVar(x) {
  return x.startsWith(ARGS_PREFIX);
}

function getFullChildrenNamesForRegex(
  sectionState,
  sectionIdsToNames,
  fullNameToId,
  fullNameToComponentIdx,
  sectionId,
  parentName,
  parentLengths,
) {
  const output = [];
  for (const c of sectionState[sectionId].children) {
    const subType = getSectionType(c).config.subType;
    const name = sectionIdsToNames[c];
    const currComponentName = subType === LIST ? name : `["${name}"]`;
    const currFullName = `${parentName}${currComponentName}`;
    output.push(
      ...getFullChildrenNamesForRegex(
        sectionState,
        sectionIdsToNames,
        fullNameToId,
        fullNameToComponentIdx,
        c,
        currFullName,
        [...parentLengths, currFullName.length],
      ),
    );
  }
  const fullName = parentName;
  const argsFullName = `${ARGS_PREFIX}${parentName}`;
  output.push(escapeRegExp(fullName), escapeRegExp(argsFullName));
  fullNameToId[fullName] = sectionId;
  fullNameToId[argsFullName] = sectionId;
  fullNameToComponentIdx[fullName] = parentLengths;
  fullNameToComponentIdx[argsFullName] = parentLengths.map(
    (x) => x + ARGS_PREFIX.length,
  );
  return output;
}
