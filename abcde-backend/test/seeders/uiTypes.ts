import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';
import { SectionUITypes } from '../../src/entities/uiTypes/sectionUITypes.entity';
import simpleTrainTestUITypes from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypes';
import baseUITypes from '../../../abcde-frontend/src/__tests__data/BaseUITypes';
import presetUITypes from '../../../abcde-frontend/src/__tests__data/PresetUITypes';
import { CodeInfo } from '../../src/entities/codeInfo.entity';
import { UITypesColsIds } from '../../src/entities/uiTypes/uiTypesColsIds.entity';
import { createIfNotFound } from '../utils';
import { SliderUITypes } from '../../src/entities/uiTypes/sliderUITypes.entity';
import { TextUITypes } from '../../src/entities/uiTypes/textUITypes.entity';
import { SwitchUITypes } from '../../src/entities/uiTypes/switchUITypes.entity';
import { RefUITypes } from '../../src/entities/uiTypes/refUITypes.entity';

async function createSectionUIType(em, x) {
  const baseType = em.create(UITypes, x);
  let [collections, uiTypeCol, childUIType] = [null, null, null];

  const {
    config: {
      collections: xCollections,
      uiTypeCollectionId: xUITypeCol,
      childUITypeId: xChildUITypeId,
      subType,
    },
  } = x;

  if (xCollections.length > 0) {
    collections = em.create(CodeInfo, {
      name: '',
      type: 'collection',
      children: xCollections,
    });
  }

  if (xUITypeCol) {
    uiTypeCol = await createIfNotFound(em, UITypesColsIds, {
      id: xUITypeCol,
    });
  }

  if (xChildUITypeId) {
    childUIType = await createIfNotFound(em, UITypes, {
      id: xChildUITypeId,
    });
  }

  em.create(SectionUITypes, {
    id: baseType,
    collections,
    uiTypeCol,
    childUIType,
    subType,
  });
}

async function createSliderUIType(em, x) {
  em.create(UITypes, x);
  em.create(SliderUITypes, { id: x.id, ...x.config });
}

async function createTextUIType(em, x) {
  em.create(UITypes, x);
  em.create(TextUITypes, { id: x.id, ...x.config });
}

async function createSwitchUIType(em, x) {
  em.create(UITypes, x);
  em.create(SwitchUITypes, { id: x.id, ...x.config });
}

async function createRefUIType(em, x) {
  em.create(UITypes, x);
  em.create(RefUITypes, { id: x.id, ...x.config });
}

export class UITypesSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const uiTypeList = [simpleTrainTestUITypes, baseUITypes, presetUITypes];
    for (const currUITypes of uiTypeList) {
      for (const x of Object.values(currUITypes)) {
        if (
          ['SECTION', 'LIST_ROOT', 'DICT_ROOT', 'DECK', 'GROUP'].includes(
            x.type,
          )
        ) {
          await createSectionUIType(em, x);
        } else if (x.type === 'SLIDER') {
          await createSliderUIType(em, x);
        } else if (x.type === 'TEXT') {
          await createTextUIType(em, x);
        } else if (x.type === 'SWITCH') {
          await createSwitchUIType(em, x);
        } else if (x.type === 'REF') {
          await createRefUIType(em, x);
        } else {
          em.create(UITypes, x);
        }
      }
    }
  }
}
