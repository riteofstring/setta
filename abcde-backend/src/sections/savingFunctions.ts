import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';
import { SectionConfig } from '../entities/sections/sectionConfig.entity';
import { Sections } from '../entities/sections/sections.entity';
import { SectionConfigCols } from '../entities/sections/sectionConfigCols.entity';
import { SectionConfigColsIds } from '../entities/sections/sectionConfigColsIds.entity';
import _ = require('lodash');
import { SectionChildrenIds } from '../entities/sections/sectionChildrenIds.entity';
import { SectionChildren } from '../entities/sections/sectionChildren.entity';

export async function persistSections(em, sections, sectionChildrenIds) {
  for (const v of _.values(sections)) {
    const scid = sectionChildrenIds[v.id];
    await em.upsert(SectionChildrenIds, { id: scid });
    const assign = {
      id: v.id,
      name: v.name,
      paramInfo: v.paramInfoId,
      children: scid,
    };
    await em.upsert(Sections, assign);
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
  const col = await em.upsert(SectionChildrenIds, {
    id: sectionChildrenId,
  });
  const childEntities = [];
  for (let i = 0; i < sectionChildren.length; i++) {
    const assign = {
      id: sectionChildrenId,
      section: sectionChildren[i],
      order: i,
    };
    childEntities.push(await em.upsert(SectionChildren, assign));
  }
  col.sectionChildren.set(childEntities);
  em.persist(col);
}

export async function persistSectionConfigs(em, sectionConfigs) {
  for (const v of _.values(sectionConfigs)) {
    await em.upsert(EVColsIds, { id: v.evColId });
    await em.upsert(KwargColsIds, { id: v.kwargColId });

    const assign = {
      id: v.id,
      evCol: v.evColId,
      kwargCol: v.kwargColId,
      selectedItem: v.selectedItem,
      uiType: v.uiTypeId,
    };
    await em.upsert(SectionConfig, assign);
  }
}

export async function persistSectionConfigCol(em, sectionConfigCol, colId) {
  await em.upsert(SectionConfigColsIds, { id: colId });
  for (const sectionId of _.keys(sectionConfigCol)) {
    const assign = {
      id: colId,
      section: sectionId,
      config: sectionConfigCol[sectionId],
    };
    await em.upsert(SectionConfigCols, assign);
  }
}
