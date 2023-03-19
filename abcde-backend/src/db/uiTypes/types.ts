import { Prisma } from '@prisma/client';
import {
  ManySectionUITypeType,
  ManyUITypeType,
} from 'abcde-utils/src/types/uiType';

export type PrismaUITypeColType = Prisma.UITypeColGetPayload<true>;

export enum UITypeNames {
  sectionUIType = 'sectionUIType',
  sliderUIType = 'sliderUIType',
  switchUIType = 'switchUIType',
  textUIType = 'textUIType',
  refUIType = 'refUIType',
  all = 'all',
}

export type ManyXUITypeType<T> = T extends UITypeNames.sectionUIType
  ? ManySectionUITypeType
  : ManyUITypeType;

export function UITypeNameToIncludeObj(typeName) {
  if (typeName === UITypeNames.all) {
    return {
      sectionUIType: {
        include: {
          collections: { select: { id: true } },
        },
      },
      sliderUIType: true,
      switchUIType: true,
      textUIType: true,
      refUIType: true,
    };
  } else if (typeName === UITypeNames.sectionUIType) {
    return {
      sectionUIType: {
        include: {
          collections: { select: { id: true } },
        },
      },
    };
  }
  // TODO: fill in the rest
}
