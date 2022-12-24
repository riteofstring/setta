import { Prisma } from '@prisma/client';

export interface SectionChildrenType {
  [id: string]: string[];
}

export interface SectionConfigColType {
  [id: string]: string;
}

export interface SectionType {
  [id: string]: Prisma.SectionGetPayload<true> & { sectionChildrenId: string };
}
