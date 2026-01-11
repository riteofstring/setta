import type { Collision, UniqueIdentifier } from "@dnd-kit/abstract";
import type { Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";

export type ClientRect = {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
};

export type Transform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export type Disabled = {
  draggable?: boolean;
  droppable?: boolean;
};

export type SortableData = {
  sortable: {
    containerId: UniqueIdentifier;
    items: UniqueIdentifier[];
    index: number;
  };
};

export type DndData<T extends Record<string, unknown> = Record<string, unknown>> =
  {
    current: T;
  };

export type SettaCollision = Collision & {
  pastHalfway?: boolean;
  triggerDistCondition?: boolean;
  data?: Collision["data"] & {
    droppable?: Droppable;
    absTriggerDist?: number;
    triggerDist?: number;
    intersectionRatio?: number;
  };
};

export type DragEvent = {
  activatorEvent: Event | null;
  active: Draggable;
  collisions: SettaCollision[] | null;
  delta: Coordinates;
  over: Droppable | null;
  activeRect?: ClientRect | null;
  pointerCoordinates?: Coordinates | null;
};

export type DragStartEvent = Pick<DragEvent, "active">;

export type DragMoveEvent = DragEvent;

export type DragOverEvent = DragEvent;

export type DragEndEvent = DragEvent & {
  canceled?: boolean;
};

export type DragCancelEvent = DragEndEvent;

export type SortingStrategy = (args: {
  rects: Array<ClientRect | undefined>;
  activeNodeRect?: ClientRect | null;
  activeIndex: number;
  overIndex: number;
  index: number;
  pastHalfway?: boolean;
}) => Transform | [Transform | null, number] | null;
