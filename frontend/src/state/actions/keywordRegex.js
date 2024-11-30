import C from "constants/constants.json";
import { getParamIds } from "state/actions/sections/sectionContents";

// input is useSectionInfos state
export function getRegexAndColorMap(state) {
  const topLevelIds = Object.keys(state.x).filter((id) =>
    [C.GLOBAL_VARIABLES, C.SECTION, C.LIST_ROOT, C.DICT_ROOT, C.DECK].includes(
      state.uiTypes[state.x[id].uiTypeId].type,
    ),
  );
  const names = [];
  const fullNameToInfo = {};
  for (const sid of topLevelIds) {
    if (state.singletonSections[C.GLOBAL_VARIABLES] === sid) {
      setFullParamRegex(state, sid, null, names, fullNameToInfo, "", [], true);
    } else {
      const currName = state.x[sid].name;
      setFullChildrenNamesForRegex(
        state,
        names,
        fullNameToInfo,
        sid,
        currName,
        [currName.length],
      );
    }
  }

  if (names.length === 0) {
    return {
      pattern: dummyRegExpObject(),
      codeAreaPattern: dummyRegExpObject(),
      fullNameToInfo,
    };
  }

  const patternStr = `(?<![A-Za-z."'_])(${names.join("|")})(?![A-Za-z"'_])`;
  const pattern = new RegExp(patternStr, "g");
  const codeAreaPattern = new RegExp(
    `(?<=.*?\\$${C.SETTA_GENERATED_PYTHON}.*?)${patternStr}`,
    "gs",
  );

  return { pattern, codeAreaPattern, fullNameToInfo };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function dummyRegExpObject() {
  return {
    exec: function () {
      return null;
    },
  };
}

function setFullChildrenNamesForRegex(
  state,
  allNames,
  fullNameToInfo,
  sectionId,
  parentName,
  parentLengths,
) {
  const sectionTypeName = state.uiTypes[state.x[sectionId].uiTypeId].type;
  for (const [idx, c] of state.variants[
    state.x[sectionId].variantId
  ].children.entries()) {
    const name = state.x[c].name;
    const currComponentName =
      sectionTypeName === C.LIST_ROOT ? `[${idx.toString()}]` : `["${name}"]`;
    const currFullName = `${parentName}${currComponentName}`;
    setFullChildrenNamesForRegex(
      state,
      allNames,
      fullNameToInfo,
      c,
      currFullName,
      [...parentLengths, currFullName.length],
    );
  }
  const fullName = parentName;
  const argsFullName = `${C.ARGS_PREFIX}${parentName}`;
  const argsParentLengths = parentLengths.map((x) => x + C.ARGS_PREFIX.length);
  setFullParamRegex(
    state,
    sectionId,
    null,
    allNames,
    fullNameToInfo,
    argsFullName,
    argsParentLengths,
  );
  allNames.push(escapeRegExp(fullName));
  fullNameToInfo[fullName] = {
    sectionId,
    paramInfoId: null,
    componentIndices: parentLengths,
    isArgsObj: false,
  };
  if (sectionTypeName === C.SECTION) {
    allNames.push(escapeRegExp(argsFullName));
    fullNameToInfo[argsFullName] = {
      sectionId,
      paramInfoId: null,
      componentIndices: argsParentLengths,
      isArgsObj: true,
    };
  }
}

function setFullParamRegex(
  state,
  sectionId,
  paramInfoId,
  allNames,
  fullNameToInfo,
  parentName,
  parentLengths,
  isGlobalVar = false,
) {
  const codeInfoChildren =
    state.codeInfoCols[
      state.variants[state.x[sectionId].variantId].codeInfoColId
    ].children;
  const childParamInfos = paramInfoId
    ? codeInfoChildren[paramInfoId].map((x) => state.codeInfo[x])
    : getParamIds(sectionId, state.codeInfo, codeInfoChildren).ids.map(
        (x) => state.codeInfo[x],
      );

  for (const p of childParamInfos) {
    if (!p.name) {
      continue;
    }
    const fullName = isGlobalVar ? p.name : `${parentName}["${p.name}"]`;
    const newLengthsArray = [...parentLengths, fullName.length];
    setFullParamRegex(
      state,
      sectionId,
      p.id,
      allNames,
      fullNameToInfo,
      fullName,
      newLengthsArray,
    );
    allNames.push(escapeRegExp(fullName));
    fullNameToInfo[fullName] = {
      sectionId,
      paramInfoId: p.id,
      componentIndices: newLengthsArray,
      isArgsObj: false,
    };
  }
}
