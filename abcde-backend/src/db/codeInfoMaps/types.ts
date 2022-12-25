import { Prisma } from '@prisma/client';

export type PrismaUserCodeInfoMapType = Prisma.UserCodeInfoMapGetPayload<true>;
export type PrismaUserCodeInfoTypeMapType =
  Prisma.UserCodeInfoTypeMapGetPayload<true>;

export type PrismaProjectConfigCodeInfoMapType =
  Prisma.ProjectConfigCodeInfoMapGetPayload<true>;
export type PrismaProjectConfigCodeInfoTypeMapType =
  Prisma.ProjectConfigCodeInfoTypeMapGetPayload<true>;
