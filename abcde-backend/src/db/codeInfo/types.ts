import { Prisma } from '@prisma/client';

export interface CodeInfoType {
  [id: string]: Prisma.CodeInfoGetPayload<true> & { parentId: string };
}
