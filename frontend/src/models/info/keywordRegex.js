import { hasParentInFlattenedStructure } from "thunks/sections/getters";
import { getParamInfos } from "thunks/sections/sectionContents";
import { SINGLETON_SECTIONS } from "utils/constants";
import { create } from "../utils";

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
  const names = [];
  const colorMap = {};
  for (const [sid, sName] of Object.entries(sectionIdsToNames)) {
    if (SINGLETON_SECTIONS.globalVariables === sid) {
      names.push(
        ...getParamInfos(sid).map((x) => {
          const curr = escapeRegExp(x.name);
          colorMap[curr] = "green";
          return curr;
        }),
      );
    } else if (!hasParentInFlattenedStructure(sid)) {
      const curr = escapeRegExp(sName);
      colorMap[curr] = "red";
      names.push(curr);
      const argsVar = `${ARGS_PREFIX}${curr}`;
      colorMap[argsVar] = "red";
      names.push(argsVar);
    }
  }

  const pattern = new RegExp(
    `(?<![."'])\\b(${names.join("|")})\\b(?!["'])`,
    "g",
  );

  return { pattern, colorMap };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


export function isArgsVar(x){
  return x.startsWith(ARGS_PREFIX)
}

export function withoutArgsPrefix(x){
  return x.slice(ARGS_PREFIX.length)
}