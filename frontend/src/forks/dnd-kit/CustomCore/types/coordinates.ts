import type { Coordinates } from "@dnd-kit/utilities";

export type { Coordinates };

export type DistanceMeasurement =
  | number
  | Coordinates
  | Pick<Coordinates, "x">
  | Pick<Coordinates, "y">;

export type Translate = Coordinates;

interface ScrollCoordinates {
  initial: Coordinates;
  current: Coordinates;
  delta: Coordinates;
}
