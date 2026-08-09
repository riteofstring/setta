type SortingOverState = {
  overId: string | null;
  pastHalfway: boolean | null;
};

const sortingOverStateByContainer: Record<string, SortingOverState> = {};

export function setSortingOverState(
  containerId: string,
  overId: string | null,
  pastHalfway: boolean | null,
): void {
  sortingOverStateByContainer[containerId] = { overId, pastHalfway };
}

export function clearSortingOverState(containerId: string): void {
  delete sortingOverStateByContainer[containerId];
}

export function resetSortingOverState(): void {
  for (const key of Object.keys(sortingOverStateByContainer)) {
    delete sortingOverStateByContainer[key];
  }
}

export function getSortingOverState(
  containerId: string,
): SortingOverState | null {
  return sortingOverStateByContainer[containerId] ?? null;
}
