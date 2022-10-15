import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';
import { SectionConfig } from '../entities/sections/sectionConfig.entity';
import { Sections } from '../entities/sections/sections.entity';
import { SectionConfigCols } from '../entities/sections/sectionConfigCols.entity';
import { SectionConfigColsIds } from '../entities/sections/sectionConfigColsIds.entity';
import { createIfNotFound } from '../utils/utils';
import _ = require('lodash');

export async function persistSections(em, sections) {
  for (const v of _.values(sections)) {
    const findBy = { id: v.id };
    const assign = {
      name: v.name,
      paramInfo: v.paramInfoId,
    };
    await createIfNotFound(em, Sections, findBy, assign);
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
    const assign = {
      evCol: v.evColId,
      kwargCol: v.kwargColId,
      selectedItem: v.selectedItem,
      uiType: v.uiTypeId,
    };
    await createIfNotFound(em, SectionConfig, findBy, assign);
  }
}

export async function persistSectionConfigCols(em, sectionConfigCols) {
  for (const colId of _.keys(sectionConfigCols)) {
    em.create(SectionConfigColsIds, { id: colId });
    for (const curr of _.values(sectionConfigCols[colId])) {
      const findBy = { id: colId, section: curr.id };
      const assign = { config: curr.configId };
      await createIfNotFound(em, SectionConfigCols, findBy, assign);
    }
  }
}
