import { Prisma } from '@prisma/client';

export type PrismaSectionType = Prisma.SectionGetPayload<true>;
export type PrismaSectionChildrenType = Prisma.SectionChildrenGetPayload<true>;
export type PrismaSectionDescriptionType =
  Prisma.SectionDescriptionGetPayload<true>;
export type PrismaSectionDetailsType = Prisma.SectionGetPayload<{
  select: {
    id;
    paramInfoId;
    evColId;
    uiTypeId;
    kwargColId;
    uiTypeColId;
    selectedItemId;
    descriptionId;
  };
}>;
