import { getFullObjPath } from "classes/immutableInfo";
import { topLevelSectionInfo } from "hooks/useSectionInfo";
import _ from "lodash";
import { OBJ, PARAM, STRING, VARIABLE } from "./codeGenConstants";
import { DECK, isRoot, LIST_ROOT } from "./constants";
import { maybeUseNullId } from "./utils";

function paramInfoExportSelected(sectionId, paramInfo, evColId, state) {
  const evId = state.paramInfos.x[evColId]?.[paramInfo.id];
  if (!evId) {
    return undefined;
  }
  const { value, childId } = state.enteredValues.x[evId];
  const sectionChildren = state.sectionInfos.currChildren[sectionId];
  if (sectionChildren && sectionChildren.includes(childId)) {
    return sectionExportSelected(state.sectionInfos.x[childId], state);
  }
  return value;
}

function multipleParamInfoExportSelected(
  sectionId,
  paramInfos,
  evColId,
  state
) {
  const output = {};
  for (let p of paramInfos) {
    let paramSelection = paramInfoExportSelected(sectionId, p, evColId, state);
    if (!_.isNil(paramSelection)) {
      paramSelection = maybeStringPrefix(paramSelection);
      output[paramPrefix(p.name)] = paramSelection;
    }
  }
  return output;
}

function paramCollectionExportSelected(
  sectionId,
  sectionType,
  allCodeInfo,
  paramCollections,
  evColId,
  state
) {
  const {
    config: { collections },
  } = sectionType;
  let currParamCollections = [];
  for (let c of collections) {
    if (c in paramCollections) {
      currParamCollections = [...currParamCollections, ...paramCollections[c]];
    }
  }
  return multipleParamInfoExportSelected(
    sectionId,
    currParamCollections.map((x) => allCodeInfo[x.id]),
    evColId,
    state
  );
}

function kwargsExportSelected(
  sectionId,
  objInfoId,
  evColId,
  kwargColId,
  state
) {
  const kwargIds = state.objInfos.x[kwargColId]?.[maybeUseNullId(objInfoId)];
  if (!kwargIds) {
    return {};
  }
  const kwargInfos = kwargIds.map((y) => state.codeInfo.allCodeInfo[y]);
  return multipleParamInfoExportSelected(sectionId, kwargInfos, evColId, state);
}

function objInfoExportSelected(sectionId, objInfo, evColId, state) {
  const { path: fullObjPath } = getFullObjPath(objInfo);
  const output = multipleParamInfoExportSelected(
    sectionId,
    objInfo.children.map((x) => state.codeInfo.allCodeInfo[x]),
    evColId,
    state
  );
  return { [objPrefix(fullObjPath)]: output };
}

function sectionExportSelected(section, state) {
  const { allCodeInfo, paramCollections } = state.codeInfo;
  const { id: sectionId, configId } = section;
  const { selectedItem, uiTypeId, evColId, kwargColId } =
    state.sectionConfigs.x[configId];
  const sectionType = state.uiTypes.x[uiTypeId];

  if (isRoot(sectionType.type)) {
    const currChildren = state.sectionInfos.currChildren[section.id];
    return multipleSectionExportSelected(currChildren, sectionType, state);
  }

  const nonObjParams = paramCollectionExportSelected(
    sectionId,
    sectionType,
    allCodeInfo,
    paramCollections,
    evColId,
    state
  );

  const kwargs = kwargsExportSelected(
    sectionId,
    selectedItem,
    evColId,
    kwargColId,
    state
  );

  let output = { ...nonObjParams, ...kwargs };
  if (selectedItem) {
    const objParams = objInfoExportSelected(
      sectionId,
      allCodeInfo[selectedItem],
      evColId,
      state
    );
    const key = Object.keys(objParams)[0];
    output = { [key]: { ...objParams[key], ...output } };
  }

  return output;
}

function processSelected(currSection, selected, sectionType, state) {
  const currSectionConfig = state.sectionConfigs.x[currSection.configId];
  const currSectionType = state.uiTypes.x[currSectionConfig.uiTypeId].type;
  const parentIsPane = !sectionType;
  const parentIsListRoot = sectionType?.type === LIST_ROOT;
  if (parentIsListRoot) {
    if (currSectionType === DECK) {
      return Object.values(selected);
    } else {
      return [selected];
    }
  } else {
    // the "section" is the pane, and the children are top-level sections
    if (currSectionType === DECK) {
      return parentIsPane
        ? _.mapKeys(selected, (v, k) => topLevelPrefix(k))
        : selected;
    } else {
      return parentIsPane
        ? { [topLevelPrefix(currSection.name)]: selected }
        : { [currSection.name]: selected };
    }
  }
}

function multipleSectionExportSelected(children, sectionType, state) {
  const parentIsListRoot = sectionType?.type === LIST_ROOT;
  let output = parentIsListRoot ? [] : {};
  for (let c of children) {
    const currSection = state.sectionInfos.x[c];
    let selected = sectionExportSelected(currSection, state);
    selected = processSelected(currSection, selected, sectionType, state);
    output = parentIsListRoot
      ? [...output, ...selected]
      : { ...output, ...selected };
  }
  return output;
}

export function exportSelected(state) {
  const topLevelSectionIds = topLevelSectionInfo(state.sectionInfos.x).map(
    (x) => x.id
  );
  return multipleSectionExportSelected(topLevelSectionIds, null, state);
}

function topLevelPrefix(key) {
  return `${VARIABLE}${key}`;
}

function objPrefix(key) {
  return `${OBJ}${key}`;
}

function paramPrefix(key) {
  return `${PARAM}${key}`;
}

function stringPrefix(x) {
  return `${STRING}${x}`;
}

function maybeStringPrefix(x) {
  return _.isString(x) ? stringPrefix(x) : x;
}

// Look at parent of deck to determine what to do with children of deck
// 1. If parent of deck is the pane, then children become top-level sections.
// 2. If parent of deck is a list root, then children become list elements.
// 3. If parent of deck is a dict root, then children become dict elements.
// 4. If parent of deck is a section, then children become nested params.
