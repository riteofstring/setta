import { returnNullNotUndefined, createIfNotFound } from '../utils/utils';
import _ = require('lodash');
import { EV } from '../entities/enteredValues/ev.entity';
import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { EVCols } from '../entities/enteredValues/evCols.entity';
import { Sections } from '../entities/sections/sections.entity';
import { SectionConfig } from '../entities/sections/sectionConfig.entity';
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';

export async function persistEV(em, ev) {
  for (const evId of _.keys(ev)) {
    const v = ev[evId];
    const findBy = { id: evId };
    const fullProps = {
      ...findBy,
      value: v.value ? v.value.toString() : null,
      child: returnNullNotUndefined(v.childId),
    };
    await createIfNotFound(em, EV, findBy, fullProps);
  }
}

export async function persistEVCols(em, evCols) {
  for (const evColId of _.keys(evCols)) {
    await createIfNotFound(em, EVColsIds, { id: evColId });
    for (const codeInfoId of _.keys(evCols[evColId])) {
      const findBy = {
        id: evColId,
        codeInfo: codeInfoId,
      };
      const fullProps = {
        ...findBy,
        enteredValue: evCols[evColId][codeInfoId].enteredValueId,
      };
      await createIfNotFound(em, EVCols, findBy, fullProps);
    }
  }
}

export async function persistSections(em, sections) {
  for (const v of _.values(sections)) {
    const findBy = { id: v.id };
    const fullProps = {
      ...findBy,
      name: v.name,
      paramInfo: v.paramInfoId,
    };
    await createIfNotFound(em, Sections, findBy, fullProps);
  }
}

export async function persistSectionChildren(em, sectionChildren) {
  for (const sid of _.keys(sectionChildren)) {
    const x = await em.findOne(Sections, { id: sid });
    em.assign(x, {
      children: sectionChildren[sid],
    });
  }
}

export async function persistSectionConfigs(em, sectionConfigs) {
  for (const v of _.values(sectionConfigs)) {
    await createIfNotFound(em, EVColsIds, { id: v.evColId });
    await createIfNotFound(em, KwargColsIds, { id: v.kwargColId });

    const findBy = { id: v.id };
    const fullProps = {
      ...findBy,
      evCol: v.evColId,
      kwargCol: v.kwargColId,
      selectedItem: v.selectedItem,
      uiType: v.uiTypeId,
    };
    await createIfNotFound(em, SectionConfig, findBy, fullProps);
  }
}
