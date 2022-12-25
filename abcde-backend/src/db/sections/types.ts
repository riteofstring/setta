import { Prisma } from '@prisma/client';

export type PrismaSectionType = Prisma.SectionGetPayload<true>;
export type PrismaSectionChildrenType = Prisma.SectionChildrenGetPayload<true>;
export type PrismaSectionConfigType = Prisma.SectionConfigGetPayload<{
  select: {
    id: true;
    evCol: true;
    kwargCol: true;
    selectedItem: true;
    uiType: true;
  };
}>;
export type PrismaSectionConfigColType =
  Prisma.SectionConfigColGetPayload<true>;
