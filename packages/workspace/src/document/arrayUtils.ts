// The reference's `insertIntoArray` (`utils/utils.ts`), shared by the dnd children store, the
// move planners, and the move commit funnel.
export function insertIntoArray<T>(
  arr: Array<T>,
  index: number,
  ...newItems: Array<T>
): Array<T> {
  return [...arr.slice(0, index), ...newItems, ...arr.slice(index)];
}
