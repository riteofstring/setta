import { DECK, DICT_ROOT, LIST_ROOT, SECTION } from 'abcde-utils/src/constants';
import _ from 'lodash';

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
  const { evColId } = getSectionConfig(p, id);
  return Object.keys(p.evCols[evColId]);
}

function getParamUIType(p, sectionId, id) {
  const { uiTypeColId } = getSectionConfig(p, sectionId);
  return p.uiTypes[p.uiTypeCols[uiTypeColId][id]].type;
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
    this.output[varName] = {
      name: this.p.sections[id].name,
      value: this.exportSectionValue(id),
      type: getSectionType(this.p, id),
    };
    return varName;
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
    return ids.map((x) => this.exportParam(sectionId, x)).filter((x) => x);
  }

  exportParam(sectionId, id) {
    const value = this.exportParamValue(sectionId, id);
    if (_.isNil(value)) {
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
