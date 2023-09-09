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
  return p.codeInfo[selectedItem].name;
}

function getChainedSelectedItem(p, chainedFromVarName, id) {
  const { selectedItem } = p.sections[id];
  const { name } = p.codeInfo[selectedItem];
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
  const sectionChildren = p.sections[sectionId].currChildren;
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
    this.exportSections(Object.keys(this.p.projectConfig.children));
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
      return this.exportSections(this.p.sections[id].currChildren);
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
      name: this.p.codeInfo[id].name,
      value,
      type: getParamUIType(this.p, sectionId, id),
    };
    return varName;
  }

  exportParamValue(sectionId, id) {
    const { evColId } = this.p.sections[sectionId];
    const value = this.p.evCols[evColId][id];
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
