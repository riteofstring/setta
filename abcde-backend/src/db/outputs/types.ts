import { Prisma } from '@prisma/client';

export type PrismaOutputType = Prisma.OutputGetPayload<true>;
export type PrismaOutputGroupType = Prisma.OutputGroupGetPayload<true>;
