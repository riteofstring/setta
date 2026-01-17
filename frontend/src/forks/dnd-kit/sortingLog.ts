import { useDndState } from "./dndState";

let sortLogSequence = 0;

function shouldLogSorting(): boolean {
  return useDndState.getState().isSorting;
}

export function logSortDnd(label: string, payload: Record<string, unknown>): void {
  if (!shouldLogSorting()) {
    return;
  }

  sortLogSequence += 1;
  const serialized = JSON.stringify({
    seq: sortLogSequence,
    ts: Date.now(),
    label,
    ...payload,
  });
  console.log(serialized);
}
