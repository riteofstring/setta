import { Prisma } from '@prisma/client';

export type PrismaSectionType = Prisma.SectionGetPayload<true>;
export type PrismaSectionChildrenType = Prisma.SectionChildrenGetPayload<true>;
export type PrismaSectionConfigType = Prisma.SectionConfigGetPayload<true>;
export type PrismaSectionConfigColType =
  Prisma.SectionConfigColGetPayload<true>;
