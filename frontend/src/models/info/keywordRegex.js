import { getParamInfos } from "thunks/sections/sectionContents";
import { SINGLETON_SECTIONS } from "utils/constants";
import { create } from "../utils";

export const useKeywordRegex = create((set) => ({
  pattern: "",
  colorMap: {},
  update: (sectionIdsToNames) => set(getRegexAndColorMap(sectionIdsToNames)),
  updateGlobalVariables: (globalVariableId) =>
    set(getRegexAndColorMap({ [globalVariableId]: null })),
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
    } else {
      const curr = escapeRegExp(sName);
      colorMap[curr] = "red";
      names.push(curr);
    }
  }

  const pattern = new RegExp(`\\b(${names.join("|")})\\b`, "g");

  return { pattern, colorMap };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
