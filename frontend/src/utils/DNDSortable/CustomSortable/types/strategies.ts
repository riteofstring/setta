import type {ClientRect} from 'utils/DNDSortable/CustomCore';
import type {Transform} from '@dnd-kit/utilities';

export type SortingStrategy = (args: {
  activeNodeRect: ClientRect | null;
  activeIndex: number;
  index: number;
  rects: ClientRect[];
  overIndex: number;
}) => Transform | null;
