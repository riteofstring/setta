import { Prisma } from '@prisma/client';

interface PasswordAsString {
  password: string;
}

export interface SeedUserType {
  [id: string]: Prisma.UserGetPayload<{
    select: { id: true; name: true; projects: { select: { id: true } } };
  }> &
    PasswordAsString;
}

export type NewUserType = Prisma.UserGetPayload<{
  select: { name: true };
}> &
  PasswordAsString;

export type ExistingUserType = Prisma.UserGetPayload<{
  select: { id: true };
}> &
  NewUserType;
