import { Prisma } from '@prisma/client';

export interface EVType {
  [id: string]: Prisma.EVGetPayload<true>;
}

export interface EVColType {
  [id: string]: { [codeInfoId: string]: string };
}
