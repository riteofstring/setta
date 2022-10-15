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

// TODO: delete this and use mikro-orm upsert once it's available in newer version
export async function createIfNotFound(
  em,
  type,
  findBy,
  fullProps = null,
  persist = true,
) {
  let x = await em.findOne(type, findBy);
  if (!x) {
    x = em.create(type, fullProps ? fullProps : findBy);
  } else if (fullProps) {
    em.assign(x, fullProps);
  }
  if (persist) {
    em.persist(x);
  }
  return x;
}
