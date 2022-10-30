import { Prisma } from '@prisma/client';

export function renameKeys(x, toRename) {
  const output = { ...x };
  for (const oldK of Object.keys(toRename)) {
    const newK = toRename[oldK];
    if (oldK in output) {
      output[newK] = output[oldK];
      delete output[oldK];
    }
  }
  return output;
}

export function returnNullNotUndefined(x) {
  return x === undefined ? null : x;
}

export function prismaNullOrConnect(x) {
  return !x ? Prisma.DbNull : { connect: { id: x } };
}

// TODO: delete this and use mikro-orm upsert once it's available in newer version
export async function createIfNotFound(
  em,
  type,
  findBy,
  assign = null,
  persist = true,
) {
  let x = await em.findOne(type, findBy);
  if (!x) {
    x = em.create(type, findBy);
  }
  if (assign) {
    em.assign(x, assign);
  }
  if (persist) {
    em.persist(x);
  }
  return x;
}
