import { prisma } from 'src/db/prisma';

const clearSqlite = async () => {
  const tables = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT name FROM sqlite_master WHERE type='table';`;

  console.log('tables', tables);
  await prisma.$executeRaw`PRAGMA foreign_keys=OFF;`;

  await prisma.$transaction([
    ...tables.map(({ name }) =>
      prisma.$executeRawUnsafe(`DELETE FROM ${name};`),
    ),
  ]);
  await prisma.$executeRaw`PRAGMA foreign_keys=ON;`;
};

export async function clearPostgres() {
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');

  try {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  } catch (error) {
    console.log({ error });
  }
}

export const clearDb = async () => {
  const executeClear = {
    sqlite: clearSqlite,
    postgres: clearPostgres,
  };

  const execute = executeClear['sqlite'];
  return await execute();
};
