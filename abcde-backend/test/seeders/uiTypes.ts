import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { UITypes } from '../../src/entities/uitypes/uiTypes.entity';
import { SectionUITypes } from '../../src/entities/uiTypes/sectionUITypes.entity';
import simpleTrainTest from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UI';
import baseUITypes from '../../../abcde-frontend/src/__tests__data/BaseUITypes';
import { CodeInfo } from '../../src/entities/codeInfo.entity';
import { UITypesColsIds } from '../../src/entities/uiTypes/uiTypesColsIds.entity';

async function createIfNotFound(em, type, props) {
  let x = await em.findOne(type, props);
  if (!x) {
    x = em.create(type, props);
  }
  return x;
}

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

export class UITypesSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const uiTypeList = [simpleTrainTest, baseUITypes];
    for (const currUITypes of uiTypeList) {
      for (const x of Object.values(currUITypes.uiTypes)) {
        if (['SECTION', 'LIST_ROOT', 'DICT_ROOT', 'DECK'].includes(x.type)) {
          await createSectionUIType(em, x);
        } else {
          em.create(UITypes, x);
        }
      }
    }
  }
}
