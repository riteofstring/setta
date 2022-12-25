import { OBJ, PARAM, STRING, VARIABLE } from 'abcde-utils/src/codeGenConstants';
import { DECK, isRoot, LIST_ROOT } from 'abcde-utils/src/constants';
import { maybeUseNullId } from 'abcde-utils/src/utils';
import _ from 'lodash';

function paramInfoExportSelected(sectionId, paramInfo, evColId, p) {
  const evId = p.evCols[evColId]?.[paramInfo.id];
  if (!evId) {
    return undefined;
  }
  const { value, childId } = p.ev[evId];
  const sectionChildren = p.sectionCurrChildren[sectionId];
  if (sectionChildren && sectionChildren.includes(childId)) {
    return sectionExportSelected(p.sections[childId], p);
  }
  return value;
}

function multipleParamInfoExportSelected(sectionId, paramInfos, evColId, p) {
  const output = {};
  for (const param of paramInfos) {
    let paramSelection = paramInfoExportSelected(sectionId, param, evColId, p);
    if (!_.isNil(paramSelection)) {
      paramSelection = maybeStringPrefix(paramSelection);
      output[paramPrefix(param.name)] = paramSelection;
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
  p,
) {
  const {
    config: { collections },
  } = sectionType;
  let currParamCollections = [] as any;
  for (const c of collections) {
    if (c in paramCollections) {
      currParamCollections = [...currParamCollections, ...paramCollections[c]];
    }
  }
  return multipleParamInfoExportSelected(
    sectionId,
    currParamCollections.map((x) => allCodeInfo[x.id]),
    evColId,
    p,
  );
}

function kwargsExportSelected(sectionId, objInfoId, evColId, kwargColId, p) {
  const kwargIds = p.kwargCols[kwargColId]?.[maybeUseNullId(objInfoId)];
  if (!kwargIds) {
    return {};
  }
  const kwargInfos = kwargIds.map((y) => p.codeInfo.allCodeInfo[y]);
  return multipleParamInfoExportSelected(sectionId, kwargInfos, evColId, p);
}

function objInfoExportSelected(sectionId, objInfo, evColId, p) {
  const output = multipleParamInfoExportSelected(
    sectionId,
    objInfo.children.map((x) => p.codeInfo.allCodeInfo[x]),
    evColId,
    p,
  );
  return { [objPrefix(objInfo.path)]: output };
}

function sectionExportSelected(section, p) {
  const { allCodeInfo, paramCollections } = p.codeInfo;
  const { id: sectionId } = section;
  const { selectedItem, uiTypeId, evColId, kwargColId } = getSectionConfig(
    section,
    p,
  );
  const sectionType = p.uiTypes[uiTypeId];

  if (isRoot(sectionType.type)) {
    const currChildren = p.sectionCurrChildren[section.id];
    return multipleSectionExportSelected(currChildren, sectionType, p);
  }

  const nonObjParams = paramCollectionExportSelected(
    sectionId,
    sectionType,
    allCodeInfo,
    paramCollections,
    evColId,
    p,
  );

  const kwargs = kwargsExportSelected(
    sectionId,
    selectedItem,
    evColId,
    kwargColId,
    p,
  );

  let output = { ...nonObjParams, ...kwargs };
  if (selectedItem) {
    const objParams = objInfoExportSelected(
      sectionId,
      allCodeInfo[selectedItem],
      evColId,
      p,
    );
    const [key, value] = Object.entries(objParams)[0];
    output = { [key]: { ...value, ...output } };
  }

  return output;
}

function processSelected(currSection, selected, sectionType, p) {
  const currSectionConfig = getSectionConfig(currSection, p);
  const currSectionType = p.uiTypes[currSectionConfig.uiTypeId].type;
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

function multipleSectionExportSelected(children, sectionType, p) {
  const parentIsListRoot = sectionType?.type === LIST_ROOT;
  let output = parentIsListRoot ? [] : {};
  for (const c of children) {
    const currSection = p.sections[c];
    let selected = sectionExportSelected(currSection, p);
    selected = processSelected(currSection, selected, sectionType, p);
    output = parentIsListRoot
      ? [...(output as any), ...(selected as any)]
      : { ...output, ...selected };
  }
  return output;
}

export function exportSelected(p) {
  const topLevelSectionIds = p.projectConfig.children;
  return multipleSectionExportSelected(topLevelSectionIds, null, p);
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

function getSectionConfig(section, p) {
  return p.sectionConfigs[p.sectionConfigCol[section.id]];
}

// Look at parent of deck to determine what to do with children of deck
// 1. If parent of deck is the pane, then children become top-level sections.
// 2. If parent of deck is a list root, then children become list elements.
// 3. If parent of deck is a dict root, then children become dict elements.
// 4. If parent of deck is a section, then children become nested params.
