import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Sections } from '../../src/entities/sections/sections.entity';
import simpleTrainTestUITypes from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypes';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';
import { EVColsIds } from '../../src/entities/enteredValues/evColsIds.entity';
import {
  createIfNotFound,
  loadAllSectionChildren,
  loadAllSectionConfigs,
  loadAllSections,
} from '../utils';
import { SectionConfig } from '../../src/entities/sections/sectionConfig.entity';
import { SectionConfigColsIds } from '../../src/entities/sections/sectionConfigColsIds.entity';
import sectionConfigCols from '../../../abcde-frontend/src/__tests__data/SectionConfigCols';
import { SectionConfigCols } from '../../src/entities/sections/sectionConfigCols.entity';

export class SectionsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const allSections = loadAllSections();
    for (const x of Object.values(allSections)) {
      await createIfNotFound(em, Sections, {
        id: x.id,
        name: x.name,
        paramInfo: x.paramInfoId,
      });
    }

    const allSectionConfigs = loadAllSectionConfigs();
    for (const x of Object.values(allSectionConfigs)) {
      await createIfNotFound(em, EVColsIds, { id: x.paramCollectionId });
      await createIfNotFound(em, SectionConfig, {
        id: x.id,
        evCol: x.paramCollectionId,
        selectedItem: x.selectedItem,
        uiType: x.uiTypeId,
      });
    }

    for (const colId of Object.keys(sectionConfigCols)) {
      em.create(SectionConfigColsIds, { id: colId });
      const currCol = sectionConfigCols[colId];
      for (const sectionId of Object.keys(currCol)) {
        em.create(SectionConfigCols, {
          id: colId,
          section: sectionId,
          config: currCol[sectionId].configId,
        });
      }
    }

    const allSectionChildren = loadAllSectionChildren();
    for (const sid of Object.keys(allSectionChildren)) {
      const section = await em.findOne(
        Sections,
        { id: sid },
        { populate: ['children'] },
      );
      const children = await em.find(Sections, {
        id: { $in: allSectionChildren[sid] },
      });
      section.children.set(children);
    }

    // update uitype origin ids
    for (const x of Object.values(simpleTrainTestUITypes)) {
      if (!x.originInfoId.sectionId) {
        continue;
      }
      const uiType = await em.findOne(UITypes, { id: x.id });
      uiType.originSection = await em.findOne(Sections, {
        id: x.originInfoId.sectionId,
      });
    }
  }
}
