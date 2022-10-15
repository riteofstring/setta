import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Sections } from '../../src/entities/sections/sections.entity';
import simpleTrainTestEV from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/EV';
import simpleTrainTestEVCols from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/EVCols';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';
import {
  loadAllSectionChildren,
  loadAllSectionConfigs,
  loadAllSections,
  loadAllUITypes,
} from '../utils';
import { SectionConfig } from '../../src/entities/sections/sectionConfig.entity';
import { SectionConfigColsIds } from '../../src/entities/sections/sectionConfigColsIds.entity';
import sectionConfigCols from '../../../abcde-frontend/src/__tests__data/SectionConfigCols';
import { SectionConfigCols } from '../../src/entities/sections/sectionConfigCols.entity';
import { EV } from '../../src/entities/enteredValues/ev.entity';
import {
  persistSectionChildren,
  persistSections,
} from '../../src/sections/savingFunctions';
import {
  persistEV,
  persistEVCols,
} from '../../src/enteredValues/savingFunctions';
import { persistUITypes } from '../../src/uiTypes/savingFunctions';

export class ProjectSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const sections = loadAllSections();
    const sectionChildren = loadAllSectionChildren();
    await persistSections(em, sections);
    await persistSectionChildren(em, sectionChildren);
    await persistEV(em, simpleTrainTestEV);
    await persistEVCols(em, simpleTrainTestEVCols);

    const uiTypes = loadAllUITypes();
    await persistUITypes(em, uiTypes);

    // const sectionConfigs = loadAllSectionConfigs();
    // await persistSectionConfigs(em, sectionConfigs);
  }
}
