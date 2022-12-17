import { Prisma } from '@prisma/client';

export interface UITypeConfigType {
  config: { [key: string]: any };
}

export interface SectionUITypeType {
  [id: string]: Prisma.SectionUITypeGetPayload<true> & UITypeConfigType;
}

export interface OriginInfoType {
  [originInfoId: string]: {
    sectionId: string;
    uiTypeColId: string;
    paramInfoId: string;
  };
}

export interface UITypeType {
  [id: string]: Prisma.UITypeGetPayload<true> & OriginInfoType;
}
