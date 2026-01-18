import type { MutableRefObject } from "react";
import type {
  Active,
  DraggableNode,
  DraggableNodes,
  DroppableContainers,
  Over,
  RectMap,
} from "../store";
import type {
  ClientRect,
  Coordinates,
  SyntheticEventName,
  Translate,
  UniqueIdentifier,
} from "../types";
import type { Collision } from "../utilities/algorithms";

enum Response {
  Start = "start",
  Move = "move",
  End = "end",
}

export type SensorContext = {
  activatorEvent: Event | null;
  active: Active | null;
  activeNode: HTMLElement | null;
  collisionRect: ClientRect | null;
  collisions: Collision[] | null;
  draggableNodes: DraggableNodes;
  draggingNode: HTMLElement | null;
  draggingNodeRect: ClientRect | null;
  droppableRects: RectMap;
  droppableContainers: DroppableContainers;
  over: Over | null;
  scrollableAncestors: Element[];
  scrollAdjustedTranslate: Translate | null;
};

export type SensorOptions = {};

export interface SensorProps<T> {
  active: UniqueIdentifier;
  activeNode: DraggableNode;
  event: Event;
  context: MutableRefObject<SensorContext>;
  options: T;
  onStart(coordinates: Coordinates): void;
  onCancel(): void;
  onMove(coordinates: Coordinates): void;
  onEnd(): void;
}

export type SensorInstance = {
  autoScrollEnabled: boolean;
};

export type SensorActivatorFunction<T> = (
  event: any,
  options: T,
  context: {
    active: DraggableNode;
  },
) => boolean | undefined;

type Activator<T> = {
  eventName: SyntheticEventName;
  handler: SensorActivatorFunction<T>;
};

export type Activators<T> = Activator<T>[];

type Teardown = () => void;

export interface Sensor<T extends object> {
  new (props: SensorProps<T>): SensorInstance;
  activators: Activators<T>;
  setup?(): Teardown | undefined;
}

type Sensors = Sensor<any>[];

export type SensorDescriptor<T extends object> = {
  sensor: Sensor<T>;
  options: T;
};

type SensorHandler = (
  event: React.SyntheticEvent,
  active: UniqueIdentifier,
) => boolean | void;
