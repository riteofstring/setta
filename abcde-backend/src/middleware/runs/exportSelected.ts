import {
  DECK,
  DICT_ROOT,
  FN,
  isSectionUIType,
  LIST_ROOT,
  REF,
  SECTION,
} from 'abcde-utils/src/constants';
import _ from 'lodash';

function getSectionType(p, id) {
  const { uiTypeId } = p.sections[id];
  return p.uiTypes[uiTypeId].type;
}

function getSelectedItem(p, id) {
  const { selectedItem } = p.sections[id];
  return p.codeInfo.allCodeInfo[selectedItem].path;
}

function getChainedSelectedItem(p, chainedFromVarName, id) {
  const { selectedItem } = p.sections[id];
  const { name } = p.codeInfo.allCodeInfo[selectedItem];
  return `${chainedFromVarName}.${name}`;
}

function getParamIds(p, id) {
  const { evColId } = p.sections[id];
  return Object.keys(p.evCols[evColId]);
}

function getParamUITypeId(p, sectionId, id) {
  const { uiTypeColId } = p.sections[sectionId];
  return p.uiTypeCols[uiTypeColId][id].uiTypeId;
}

function getParamUIType(p, sectionId, id) {
  const uiTypeId = getParamUITypeId(p, sectionId, id);
  const uiType = p.uiTypes[uiTypeId];
  if (isSectionUIType(uiType)) {
    return REF;
  }
  return uiType.type;
}

function getOriginalParamUIType(p, sectionId, id) {
  const uiTypeId = getParamUITypeId(p, sectionId, id);
  return p.uiTypes[uiTypeId].type;
}

function getParamChildId(p, sectionId, id) {
  const sectionChildren = p.sectionCurrChildren[sectionId];
  for (const s of sectionChildren) {
    if (p.sections[s].paramInfoId === id) {
      return s;
    }
  }
  return null;
}

function getSectionVarName(sectionVarNames, id) {
  if (id in sectionVarNames) {
    return sectionVarNames[id];
  }
  const name = `s${_.size(sectionVarNames)}`;
  sectionVarNames[id] = name;
  return name;
}

function getParamVarName(paramVarNames) {
  const name = `p${paramVarNames.size}`;
  paramVarNames.add(name);
  return name;
}

function noEnteredValue(value) {
  return _.isNil(value) || value === '';
}

export function exportSelected(p) {
  const e = new Exporter(p);
  e.export();
  return e.output;
}

class Exporter {
  output: Record<string, any>;
  p: any;
  sectionVarNames: Record<string, string>;
  paramVarNames: Set<string>;

  constructor(p) {
    this.output = {};
    this.p = p;
    this.sectionVarNames = {};
    this.paramVarNames = new Set();
  }

  export() {
    this.exportSections(this.p.projectConfig.children);
  }

  exportSections(ids) {
    return ids.map((x) => this.exportSection(x));
  }

  exportSection(id) {
    const varName = getSectionVarName(this.sectionVarNames, id);
    if (!(varName in this.output)) {
      this.output[varName] = {
        name: this.p.sections[id].name,
        value: this.exportSectionValue(id),
        type: getSectionType(this.p, id),
      };
    }
    return varName;
  }

  exportSectionValue(id) {
    const type = getSectionType(this.p, id);
    if (type === SECTION) {
      return {
        callable: getSelectedItem(this.p, id),
        params: this.exportParams(id),
      };
    } else if (type === FN) {
      const chainedFromVarName = this.exportSection(
        this.p.sections[id].chainedFrom,
      );
      return {
        callable: getChainedSelectedItem(this.p, chainedFromVarName, id),
        params: this.exportParams(id),
      };
    } else if ([LIST_ROOT, DICT_ROOT, DECK].includes(type)) {
      return this.exportSections(this.p.sectionCurrChildren[id]);
    }
  }

  exportParams(sectionId) {
    const ids = getParamIds(this.p, sectionId);
    return ids.map((x) => this.exportParam(sectionId, x)).filter((x) => x);
  }

  exportParam(sectionId, id) {
    const value = this.exportParamValue(sectionId, id);
    if (noEnteredValue(value)) {
      return null;
    }
    const varName = getParamVarName(this.paramVarNames);
    this.output[varName] = {
      name: this.p.codeInfo.allCodeInfo[id].name,
      value,
      type: getParamUIType(this.p, sectionId, id),
    };
    return varName;
  }

  exportParamValue(sectionId, id) {
    const { evColId } = this.p.sections[sectionId];
    const evId = this.p.evCols[evColId][id];
    const value = this.p.ev[evId];
    const originalType = getOriginalParamUIType(this.p, sectionId, id);
    const possibleChildId = getParamChildId(this.p, sectionId, id);
    if (possibleChildId) {
      return this.exportSection(possibleChildId);
    } else if (value && originalType === REF) {
      return this.exportSection(value);
    }
    return value;
  }
}

// Look at parent of deck to determine what to do with children of deck
// 1. If parent of deck is the pane, then children become top-level sections.
// 2. If parent of deck is a list root, then children become list elements.
// 3. If parent of deck is a dict root, then children become dict elements.
// 4. If parent of deck is a section, then children become nested params.
