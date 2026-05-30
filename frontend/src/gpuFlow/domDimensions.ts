import type { Dimensions } from "./flowTypes";

export function getElementDimensions(element: HTMLElement): Dimensions {
  return {
    height: element.offsetHeight,
    width: element.offsetWidth,
  };
}
