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
  colorMap: {},
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
  const colorMap = {};
  const sectionState = useSectionInfos.getState().x;
  for (const sid of topLevelIds) {
    if (SINGLETON_SECTIONS.globalVariables === sid) {
      names.push(
        ...getParamInfos(sid).map((x) => {
          const curr = escapeRegExp(x.name);
          colorMap[curr] = "green";
          return curr;
        }),
      );
    } else {
      const currName = sectionIdsToNames[sid];
      const childrenNames = getFullChildrenNamesForRegex(
        sectionState,
        sectionIdsToNames,
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

  return { pattern, colorMap };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isArgsVar(x) {
  return x.startsWith(ARGS_PREFIX);
}

export function withoutArgsPrefix(x) {
  return x.slice(ARGS_PREFIX.length);
}

function getFullChildrenNamesForRegex(
  sectionState,
  sectionIdsToNames,
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
        c,
        currFullName,
      ),
    );
  }
  output.push(
    escapeRegExp(parentName),
    escapeRegExp(`${ARGS_PREFIX}${parentName}`),
  );
  return output;
}
