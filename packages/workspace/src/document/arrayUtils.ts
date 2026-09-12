export function insertIntoArray<T>(
  arr: Array<T>,
  index: number,
  ...newItems: Array<T>
): Array<T> {
  return [...arr.slice(0, index), ...newItems, ...arr.slice(index)];
}
