import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import {
  loadAllEV,
  loadAllEVCols,
  loadAllKwargCols,
  loadAllKwargInfos,
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
import { persistCodeInfo } from '../../src/codeInfo/savingFunctions';

export class ProjectSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const kwargInfos = loadAllKwargInfos();
    const kwargCols = loadAllKwargCols();
    await persistCodeInfo(em, kwargInfos);
    await persistKwargCols(em, kwargCols);

    const sections = loadAllSections();
    const sectionChildren = loadAllSectionChildren();
    await persistSections(em, sections);
    await persistSectionChildren(em, sectionChildren);

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
