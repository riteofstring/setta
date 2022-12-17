import { Prisma } from '@prisma/client';

export interface UserType {
  [id: string]: Prisma.UserGetPayload<{
    include: { projects: { select: { id: true } } };
  }>;
}
