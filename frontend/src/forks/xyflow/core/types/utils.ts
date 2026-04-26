import { Position } from "utils/generatedTypes";

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect extends Dimensions, Position {}

export interface Box extends Position {
  x2: number;
  y2: number;
}

export type Transform = [number, number, number];

export type CoordinateExtent = [[number, number], [number, number]];
