import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import {
  loadAllEV,
  loadAllEVCols,
  loadAllKwargCols,
  loadAllSectionChildren,
  loadAllSectionConfigCols,
  loadAllSectionConfigs,
  loadAllSections,
  loadAllUITypes,
  loadAllUITypesCols,
} from '../utils';
import {
  persistSectionChildren,
  persistSectionConfigCols,
  persistSectionConfigs,
  persistSections,
} from '../../src/sections/savingFunctions';
import {
  persistEV,
  persistEVCols,
} from '../../src/enteredValues/savingFunctions';
import {
  persistUITypes,
  persistUITypesCols,
} from '../../src/uiTypes/savingFunctions';
import { persistKwargCols } from '../../src/kwargs/savingFunctions';

export class ProjectSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const sections = loadAllSections();
    const sectionChildren = loadAllSectionChildren();
    await persistSections(em, sections);
    await persistSectionChildren(em, sectionChildren);

    const kwargCols = loadAllKwargCols();
    await persistKwargCols(em, kwargCols);

    const ev = loadAllEV();
    const evCols = loadAllEVCols();
    await persistEV(em, ev);
    await persistEVCols(em, evCols);

    const uiTypes = loadAllUITypes();
    const uiTypesCols = loadAllUITypesCols();
    await persistUITypes(em, uiTypes);
    await persistUITypesCols(em, uiTypesCols);

    const sectionConfigs = loadAllSectionConfigs();
    const sectionConfigCols = loadAllSectionConfigCols();
    await persistSectionConfigs(em, sectionConfigs);
    await persistSectionConfigCols(em, sectionConfigCols);
  }
}
