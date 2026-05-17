export function createGpuFlowReadonlyMap<K, V>(
  entries: Iterable<readonly [K, V]>,
): ReadonlyMap<K, V> {
  const map = new Map(entries);
  let readonlyMap: ReadonlyMap<K, V>;
  readonlyMap = Object.freeze({
    [Symbol.iterator]: () => map[Symbol.iterator](),
    [Symbol.toStringTag]: "Map",
    entries: () => map.entries(),
    forEach: (
      callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown,
    ) => {
      map.forEach((value, key) => {
        callbackfn.call(thisArg, value, key, readonlyMap);
      });
    },
    get: (key: K) => map.get(key),
    has: (key: K) => map.has(key),
    keys: () => map.keys(),
    get size() {
      return map.size;
    },
    values: () => map.values(),
  });
  return readonlyMap;
}
