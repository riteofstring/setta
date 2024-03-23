import type { Transform } from "@dnd-kit/utilities";
import type { ClientRect } from "utils/DNDSortable/CustomCore";

export type SortingStrategy = (args: {
  activeNodeRect: ClientRect | null;
  activeIndex: number;
  index: number;
  rects: ClientRect[];
  overIndex: number;
}) => Transform | null;
