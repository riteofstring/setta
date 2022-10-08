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
