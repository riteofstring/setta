import { Prisma } from '@prisma/client';

export type PrismaSectionType = Prisma.SectionGetPayload<true>;
export type PrismaSectionChildrenType = Prisma.SectionChildrenGetPayload<true>;
