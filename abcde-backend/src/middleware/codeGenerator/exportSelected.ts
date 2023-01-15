// function paramInfoExportSelected(sectionId, paramInfo, evColId, p) {

import { DECK, DICT_ROOT, LIST_ROOT, SECTION } from 'abcde-utils/src/constants';

// function multipleParamInfoExportSelected(sectionId, paramInfos, evColId, p) {
//   const output = {};
//   for (const param of paramInfos) {
//     let paramSelection = paramInfoExportSelected(sectionId, param, evColId, p);
//     if (!_.isNil(paramSelection)) {
//       paramSelection = maybeStringPrefix(paramSelection);
//       output[paramPrefix(param.name)] = paramSelection;
//     }
//   }
//   return output;
// }

// function paramCollectionExportSelected(
//   sectionId,
//   sectionType,
//   allCodeInfo,
//   paramCollections,
//   evColId,
//   p,
// ) {
//   const {
//     config: { collections },
//   } = sectionType;
//   let currParamCollections = [] as any;
//   for (const c of collections) {
//     if (c in paramCollections) {
//       currParamCollections = [...currParamCollections, ...paramCollections[c]];
//     }
//   }
//   return multipleParamInfoExportSelected(
//     sectionId,
//     currParamCollections.map((x) => allCodeInfo[x.id]),
//     evColId,
//     p,
//   );
// }

// function kwargsExportSelected(sectionId, objInfoId, evColId, kwargColId, p) {
//   const kwargIds = p.kwargCols[kwargColId][objInfoId];
//   if (!kwargIds) {
//     return {};
//   }
//   const kwargInfos = kwargIds.map((y) => p.codeInfo.allCodeInfo[y]);
//   return multipleParamInfoExportSelected(sectionId, kwargInfos, evColId, p);
// }

// function objInfoExportSelected(sectionId, objInfo, evColId, p) {
//   const output = multipleParamInfoExportSelected(
//     sectionId,
//     objInfo.children.map((x) => p.codeInfo.allCodeInfo[x]),
//     evColId,
//     p,
//   );
//   return { [objPrefix(objInfo.path)]: output };
// }

// function sectionExportSelected(section, p) {
//   const { allCodeInfo, paramCollections } = p.codeInfo;
//   const { id: sectionId } = section;
//   const { selectedItem, uiTypeId, evColId, kwargColId } = getSectionConfig(
//     section,
//     p,
//   );
//   const sectionType = p.uiTypes[uiTypeId];

//   if (isRoot(sectionType.type)) {
//     const currChildren = p.sectionCurrChildren[section.id];
//     return multipleSectionExportSelected(currChildren, sectionType, p);
//   }

//   const nonObjParams = paramCollectionExportSelected(
//     sectionId,
//     sectionType,
//     allCodeInfo,
//     paramCollections,
//     evColId,
//     p,
//   );

//   const kwargs = kwargsExportSelected(
//     sectionId,
//     selectedItem,
//     evColId,
//     kwargColId,
//     p,
//   );

//   let output = { ...nonObjParams, ...kwargs };
//   if (selectedItem !== NULL_OBJ_ID) {
//     const objParams = objInfoExportSelected(
//       sectionId,
//       allCodeInfo[selectedItem],
//       evColId,
//       p,
//     );
//     const [key, value] = Object.entries(objParams)[0];
//     output = { [key]: { ...value, ...output } };
//   }

//   return output;
// }

// function processSelected(currSection, selected, sectionType, p) {
//   const currSectionConfig = getSectionConfig(currSection, p);
//   const currSectionType = p.uiTypes[currSectionConfig.uiTypeId].type;
//   const parentIsPane = !sectionType;
//   const parentIsListRoot = sectionType?.type === LIST_ROOT;
//   if (parentIsListRoot) {
//     if (currSectionType === DECK) {
//       return Object.values(selected);
//     } else {
//       return [selected];
//     }
//   } else {
//     // the "section" is the pane, and the children are top-level sections
//     if (currSectionType === DECK) {
//       return parentIsPane
//         ? _.mapKeys(selected, (v, k) => topLevelPrefix(k))
//         : selected;
//     } else {
//       return parentIsPane
//         ? { [topLevelPrefix(currSection.name)]: selected }
//         : { [currSection.name]: selected };
//     }
//   }
// }

// function multipleSectionExportSelected(children, sectionType, p) {
// const parentIsListRoot = sectionType?.type === LIST_ROOT;
// let output = parentIsListRoot ? [] : {};
// for (const c of children) {
//   const currSection = p.sections[c];
//   let selected = sectionExportSelected(currSection, p);
//   selected = processSelected(currSection, selected, sectionType, p);
//   output = parentIsListRoot
//     ? [...(output as any), ...(selected as any)]
//     : { ...output, ...selected };
// }
// return output;
// }

const UITYPE_TO_VARTYPE = { [SECTION]: 'obj' };

function getSectionConfig(p, id) {
  return p.sectionConfigs[p.sectionConfigCol[id]];
}

function getSectionType(p, id) {
  const { uiTypeId } = getSectionConfig(p, id);
  return p.uiTypes[uiTypeId].type;
}

function getSelectedItem(p, id) {
  const { selectedItem } = getSectionConfig(p, id);
  return p.codeInfo.allCodeInfo[selectedItem].path;
}

function getParamIds(p, id) {
  const { selectedItem, evColId, kwargColId } = getSectionConfig(p, id);
  const paramIds = Object.keys(p.evCols[evColId]);
  const kwargIds = p.kwargCols[kwargColId][selectedItem];
  return [...paramIds, ...(kwargIds ? kwargIds : [])];
}

function getParamUIType(p, sectionId, id) {
  const { uiTypeColId } = getSectionConfig(p, sectionId);
  return p.uiTypeCols[uiTypeColId][id];
}

export function exportSelected(p) {
  const e = new Exporter(p);
  e.export();
  return e.output;
}

class Exporter {
  output: Record<string, any>;
  p: any;

  constructor(p) {
    this.output = {};
    this.p = p;
  }

  export() {
    this.exportSections(this.p.projectConfig.children);
  }

  exportSections(ids) {
    return ids.map((x) => this.exportSection(x));
  }

  exportSection(id) {
    this.output[id] = {
      id,
      name: this.p.sections[id].name,
      value: this.exportSectionValue(id),
      type: UITYPE_TO_VARTYPE[getSectionType(this.p, id)],
    };
    return id;
  }

  exportSectionValue(id) {
    const type = getSectionType(this.p, id);
    if (type === SECTION) {
      return {
        callable: getSelectedItem(this.p, id),
        params: this.exportParams(id, getParamIds(this.p, id)),
      };
    } else if ([LIST_ROOT, DICT_ROOT, DECK].includes(type)) {
      return this.exportSections(this.p.sectionCurrChildren[id]);
    }
  }

  exportParams(sectionId, ids) {
    return ids.map((x) => this.exportParam(sectionId, x));
  }

  exportParam(sectionId, id) {
    this.output[id] = {
      id,
      name: this.p.codeInfo.allCodeInfo[id].name,
      value: this.exportParamValue(sectionId, id),
      type: UITYPE_TO_VARTYPE[getParamUIType(this.p, sectionId, id)],
    };
    return id;
  }

  exportParamValue(sectionId, id) {
    const { evColId } = getSectionConfig(this.p, sectionId);
    const evId = this.p.evCols[evColId][id];
    const { value, childId } = this.p.ev[evId];
    const sectionChildren = this.p.sectionCurrChildren[sectionId];
    if (sectionChildren && sectionChildren.includes(childId)) {
      return this.exportSection(childId);
    }
    return value;
  }
}

// Look at parent of deck to determine what to do with children of deck
// 1. If parent of deck is the pane, then children become top-level sections.
// 2. If parent of deck is a list root, then children become list elements.
// 3. If parent of deck is a dict root, then children become dict elements.
// 4. If parent of deck is a section, then children become nested params.
