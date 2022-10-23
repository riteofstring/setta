import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';
import { SectionConfig } from '../entities/sections/sectionConfig.entity';
import { Sections } from '../entities/sections/sections.entity';
import { SectionConfigCols } from '../entities/sections/sectionConfigCols.entity';
import { SectionConfigColsIds } from '../entities/sections/sectionConfigColsIds.entity';
import { createIfNotFound } from '../utils/utils';
import _ = require('lodash');
import { SectionChildrenIds } from '../entities/sections/sectionChildrenIds.entity';
import { SectionChildren } from '../entities/sections/sectionChildren.entity';

export async function persistSections(em, sections, sectionChildrenIds) {
  for (const v of _.values(sections)) {
    const scid = sectionChildrenIds[v.id];
    await createIfNotFound(em, SectionChildrenIds, { id: scid });
    const findBy = { id: v.id };
    const assign = {
      name: v.name,
      paramInfo: v.paramInfoId,
      children: scid,
    };
    await createIfNotFound(em, Sections, findBy, assign);
  }
}

export async function persistSectionChildren(
  em,
  sectionChildren,
  sectionChildrenIds,
) {
  for (const sectionId of _.keys(sectionChildren)) {
    await persistOneSectionChildren(
      em,
      sectionChildren[sectionId],
      sectionChildrenIds[sectionId],
    );
  }
}

export async function persistOneSectionChildren(
  em,
  sectionChildren,
  sectionChildrenId,
) {
  for (let i = 0; i < sectionChildren.length; i++) {
    const findBy = {
      id: sectionChildrenId,
      section: sectionChildren[i],
    };
    const assign = { order: i };
    await createIfNotFound(em, SectionChildren, findBy, assign);
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

export async function persistSectionConfigCol(em, sectionConfigCol, colId) {
  await createIfNotFound(em, SectionConfigColsIds, { id: colId });
  for (const sectionId of _.keys(sectionConfigCol)) {
    const findBy = { id: colId, section: sectionId };
    const assign = { config: sectionConfigCol[sectionId] };
    await createIfNotFound(em, SectionConfigCols, findBy, assign);
  }
}
