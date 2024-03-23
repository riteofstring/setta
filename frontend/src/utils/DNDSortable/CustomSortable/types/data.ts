import type { UniqueIdentifier } from "utils/DNDSortable/CustomCore";

export type SortableData = {
  sortable: {
    containerId: UniqueIdentifier;
    items: UniqueIdentifier[];
    index: number;
  };
};
