import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { Position } from "utils/generatedTypes";
import { clamp } from "utils/utils";
import type { Box, Dimensions, Node, Rect } from "../types";

export const getDimensions = (node: HTMLDivElement): Dimensions => ({
  width: node.offsetWidth,
  height: node.offsetHeight,
});

const getWheelDeltaModeFactor = (deltaMode: number): number => {
  if (deltaMode === 1) {
    return 0.05;
  }
  if (deltaMode === 0) {
    return 0.002;
  }
  return 1;
};

export const getWheelDelta = (event: WheelEvent, factor = 1): number =>
  -event.deltaY * getWheelDeltaModeFactor(event.deltaMode) * factor;

// returns a number between 0 and 1 that represents the velocity of the movement
// when the mouse is close to the edge of the canvas
const calcAutoPanVelocity = (
  value: number,
  min: number,
  max: number,
): number => {
  if (value < min) {
    return clamp(Math.abs(value - min), 1, 50) / 50;
  } else if (value > max) {
    return -clamp(Math.abs(value - max), 1, 50) / 50;
  }

  return 0;
};

export const calcAutoPan = (pos: Position, bounds: Dimensions): number[] => {
  const overview = useLocalStorage.getState().overviewTrueWidth;
  const uiEditor = useLocalStorage.getState().uiEditorTrueWidth;
  const xMovement =
    calcAutoPanVelocity(
      pos.x - overview,
      35,
      bounds.width - overview - uiEditor - 35,
    ) * 20;
  const yMovement = calcAutoPanVelocity(pos.y, 35, bounds.height - 35) * 20;

  return [xMovement, yMovement];
};

export const getBoundsOfBoxes = (box1: Box, box2: Box): Box => ({
  x: Math.min(box1.x, box2.x),
  y: Math.min(box1.y, box2.y),
  x2: Math.max(box1.x2, box2.x2),
  y2: Math.max(box1.y2, box2.y2),
});

export const rectToBox = ({ x, y, width, height }: Rect): Box => ({
  x,
  y,
  x2: x + width,
  y2: y + height,
});

export const boxToRect = ({ x, y, x2, y2 }: Box): Rect => ({
  x,
  y,
  width: x2 - x,
  height: y2 - y,
});

const nodeToRect = (node: Node): Rect => ({
  ...(node.position || { x: 0, y: 0 }),
  width: node.width || 0,
  height: node.height || 0,
});

export const getBoundsOfRects = (rect1: Rect, rect2: Rect): Rect =>
  boxToRect(getBoundsOfBoxes(rectToBox(rect1), rectToBox(rect2)));

export const getOverlappingArea = (rectA: Rect, rectB: Rect): number => {
  const xOverlap = Math.max(
    0,
    Math.min(rectA.x + rectA.width, rectB.x + rectB.width) -
      Math.max(rectA.x, rectB.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(rectA.y + rectA.height, rectB.y + rectB.height) -
      Math.max(rectA.y, rectB.y),
  );

  return Math.ceil(xOverlap * yOverlap);
};

const isReactKeyboardEvent = (
  event: KeyboardEvent | ReactKeyboardEvent,
): event is ReactKeyboardEvent => "nativeEvent" in event;

function isInputDOMNode(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const kbEvent = isReactKeyboardEvent(event) ? event.nativeEvent : event;
  // using composed path for handling shadow dom
  const target = (kbEvent.composedPath?.()?.[0] || event.target) as HTMLElement;

  const isInput =
    ["INPUT", "SELECT", "TEXTAREA"].includes(target?.nodeName) ||
    target?.hasAttribute("contenteditable");

  // when an input field is focused we don't want to trigger deletion or movement of nodes
  return isInput || !!target?.closest(".nokey");
}

export const isMouseEvent = (
  event: MouseEvent | ReactMouseEvent | TouchEvent | ReactTouchEvent,
): event is MouseEvent | ReactMouseEvent => "clientX" in event;

export const getEventPosition = (
  event: MouseEvent | ReactMouseEvent | TouchEvent | ReactTouchEvent,
  bounds?: DOMRect,
) => {
  const isMouseTriggered = isMouseEvent(event);
  const evtX = isMouseTriggered ? event.clientX : event.touches?.[0].clientX;
  const evtY = isMouseTriggered ? event.clientY : event.touches?.[0].clientY;

  return {
    x: evtX - (bounds?.left ?? 0),
    y: evtY - (bounds?.top ?? 0),
  };
};

export const getHostForElement = (
  element: HTMLElement,
): Document | ShadowRoot =>
  (element.getRootNode?.() as Document | ShadowRoot) || window?.document;
