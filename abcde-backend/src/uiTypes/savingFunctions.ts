import { UITypes } from '../entities/uitypes/uiTypes.entity';
import { SectionUITypes } from '../entities/uiTypes/sectionUITypes.entity';
import { UITypesColsIds } from '../entities/uiTypes/uiTypesColsIds.entity';
import { createIfNotFound } from '../utils/utils';
import { SliderUITypes } from '../entities/uiTypes/sliderUITypes.entity';
import { TextUITypes } from '../entities/uiTypes/textUITypes.entity';
import { SwitchUITypes } from '../entities/uiTypes/switchUITypes.entity';
import { RefUITypes } from '../entities/uiTypes/refUITypes.entity';
import { UITypesCols } from '../../src/entities/uiTypes/uiTypesCols.entity';
import _ = require('lodash');

async function persistUIType(em, x) {
  const findBy = { id: x.id };
  const assign = {
    type: x.type,
    name: x.name,
    presetType: x.presetType,
    originSection: x.originInfoId.sectionId,
    originUITypeCol: x.originInfoId.uiTypeColId,
    originCodeInfo: x.originInfoId.paramInfoId,
    isForChildOfOriginInfoId: x.isForChildOfOriginInfoId,
  };
  await createIfNotFound(em, UITypes, findBy, assign);
}

async function persistSectionUIType(em, x) {
  const {
    config: { collections, uiTypeColId, childUITypeId, subType },
  } = x;

  if (uiTypeColId) {
    await createIfNotFound(em, UITypesColsIds, { id: uiTypeColId });
  }

  if (childUITypeId) {
    await createIfNotFound(em, UITypes, { id: childUITypeId });
  }

  const findBy = { id: x.id };
  const assign = {
    collections,
    uiTypeCol: uiTypeColId,
    childUIType: childUITypeId,
    subType,
  };
  await createIfNotFound(em, SectionUITypes, findBy, assign);
}

async function persistSliderUIType(em, x) {
  const findBy = { id: x.id };
  const assign = x.config;
  await createIfNotFound(em, SliderUITypes, findBy, assign);
}

async function persistTextUIType(em, x) {
  const findBy = { id: x.id };
  const assign = x.config;
  await createIfNotFound(em, TextUITypes, findBy, assign);
}

async function persistSwitchUIType(em, x) {
  const findBy = { id: x.id };
  const assign = x.config;
  await createIfNotFound(em, SwitchUITypes, findBy, assign);
}

async function persistRefUIType(em, x) {
  const findBy = { id: x.id };
  const assign = x.config;
  await createIfNotFound(em, RefUITypes, findBy, assign);
}

export async function persistUITypes(em, uiTypes) {
  // first do all uitypes with the base uitypes entity
  for (const x of _.values(uiTypes)) {
    await persistUIType(em, x);
  }

  // Then go through them again, but this time create/update the specific types
  // This is because the specific types might have a config that refers to another uitype.
  for (const x of _.values(uiTypes)) {
    if (
      ['SECTION', 'LIST_ROOT', 'DICT_ROOT', 'DECK', 'GROUP'].includes(x.type)
    ) {
      await persistSectionUIType(em, x);
    } else if (x.type === 'SLIDER') {
      await persistSliderUIType(em, x);
    } else if (x.type === 'TEXT') {
      await persistTextUIType(em, x);
    } else if (x.type === 'SWITCH') {
      await persistSwitchUIType(em, x);
    } else if (x.type === 'REF') {
      await persistRefUIType(em, x);
    }
  }
}

export async function persistUITypesCols(em, uiTypesCols) {
  for (const uiTypeColId of Object.keys(uiTypesCols)) {
    await createIfNotFound(em, UITypesColsIds, { id: uiTypeColId });
    for (const v of _.values(uiTypesCols[uiTypeColId])) {
      const findBy = { id: uiTypeColId, codeInfo: v.id };
      const assign = { uiType: v.uiTypeId };
      await createIfNotFound(em, UITypesCols, findBy, assign);
    }
  }
}
