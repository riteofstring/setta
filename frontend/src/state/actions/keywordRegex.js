import C from "constants/constants.json";
import _ from "lodash";
import { getParamInfos } from "state/actions/sections/sectionContents";
import {
  useCodeInfo,
  useKeywordRegex,
  useSectionInfos,
} from "state/definitions";
import {
  getSectionType,
  hasParentInFlattenedStructure,
} from "state/getters/sectionInfo";
import { SINGLETON_SECTIONS } from "utils/constants";
import { getSectionChildren } from "./sectionVariants";

export function updateKeywordRegex(idsToNames = null) {
  let x = idsToNames;
  if (x === null) {
    x = _.mapValues(useSectionInfos.getState().x, (v) => v.name);
  }
  useKeywordRegex.setState(getRegexAndColorMap(x));
}

export function updateGlobalVariablesRegex(globalVariableId) {
  if (globalVariableId) {
    useKeywordRegex.setState(getRegexAndColorMap({ [globalVariableId]: null }));
  }
}

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
      setFullParamRegex(sid, null, names, fullNameToInfo, "", [], true);
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

  const pattern =
    names.length > 0
      ? new RegExp(`(?<![A-Za-z."'_])(${names.join("|")})(?![A-Za-z"'_])`, "g")
      : dummyRegExpObject();

  return { pattern, fullNameToInfo };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dummyRegExpObject() {
  return {
    exec: function () {
      return null;
    },
  };
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
  const parentSectionIsListRoot =
    getSectionType(sectionId).type === C.LIST_ROOT;
  for (const c of getSectionChildren(sectionId)) {
    const name = sectionIdsToNames[c];
    const currComponentName = parentSectionIsListRoot ? name : `["${name}"]`;
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
  const argsFullName = `${C.ARGS_PREFIX}${parentName}`;
  const argsParentLengths = parentLengths.map((x) => x + C.ARGS_PREFIX.length);
  setFullParamRegex(
    sectionId,
    null,
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
  paramInfoId,
  allNames,
  fullNameToInfo,
  parentName,
  parentLengths,
  isGlobalVar = false,
) {
  const codeInfoState = useCodeInfo.getState().x;
  const childParamInfos = paramInfoId
    ? codeInfoState[paramInfoId].children.map((x) => codeInfoState[x])
    : getParamInfos(sectionId);

  for (const p of childParamInfos) {
    if (!p.name) {
      continue;
    }
    const fullName = isGlobalVar ? p.name : `${parentName}["${p.name}"]`;
    const newLengthsArray = [...parentLengths, fullName.length];
    setFullParamRegex(
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
