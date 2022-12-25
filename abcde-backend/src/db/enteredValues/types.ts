import { Prisma } from '@prisma/client';

export type PrismaEVType = Prisma.EVGetPayload<true>;
export type PrismaEVColType = Prisma.EVColGetPayload<true>;
