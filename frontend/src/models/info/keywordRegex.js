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
  const sectionState = useSectionInfos.getState().x;
  for (const sid of topLevelIds) {
    if (SINGLETON_SECTIONS.globalVariables === sid) {
      for (const p of getParamInfos(sid)) {
        names.push(escapeRegExp(p.name));
        fullNameToId[p.name] = sid;
      }
    } else {
      const currName = sectionIdsToNames[sid];
      const childrenNames = getFullChildrenNamesForRegex(
        sectionState,
        sectionIdsToNames,
        fullNameToId,
        sid,
        currName,
      );
      names.push(...childrenNames);
    }
  }

  const pattern = new RegExp(
    `(?<![A-Za-z."'_])(${names.join("|")})(?![A-Za-z"'_])`,
    "g",
  );

  return { pattern, fullNameToId };
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
  sectionId,
  parentName,
) {
  const output = [];
  for (const c of sectionState[sectionId].children) {
    const subType = getSectionType(c).config.subType;
    const name = sectionIdsToNames[c];
    const currFullName =
      subType === LIST ? `${parentName}${name}` : `${parentName}["${name}"]`;
    output.push(
      ...getFullChildrenNamesForRegex(
        sectionState,
        sectionIdsToNames,
        fullNameToId,
        c,
        currFullName,
      ),
    );
  }
  const fullName = parentName;
  const argsFullName = `${ARGS_PREFIX}${parentName}`;
  output.push(escapeRegExp(fullName), escapeRegExp(argsFullName));
  fullNameToId[fullName] = sectionId;
  fullNameToId[argsFullName] = sectionId;
  return output;
}
