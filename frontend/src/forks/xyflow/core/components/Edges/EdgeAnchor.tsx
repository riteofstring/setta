import type { FC, MouseEvent as ReactMouseEvent, SVGAttributes } from "react";

import { HandlePosition } from "../../types";

const shiftX = (x: number, shift: number, position: HandlePosition): number => {
  if (position === HandlePosition.Left) {
    return x - shift;
  }
  if (position === HandlePosition.Right) {
    return x + shift;
  }
  return x;
};

const shiftY = (y: number, shift: number, position: HandlePosition): number => {
  if (position === HandlePosition.Top) {
    return y - shift;
  }
  if (position === HandlePosition.Bottom) {
    return y + shift;
  }
  return y;
};

interface EdgeAnchorProps extends SVGAttributes<SVGGElement> {
  position: HandlePosition;
  centerX: number;
  centerY: number;
  radius?: number;
  onMouseDown: (event: ReactMouseEvent<SVGGElement, MouseEvent>) => void;
  onMouseEnter: (event: ReactMouseEvent<SVGGElement, MouseEvent>) => void;
  onMouseOut: (event: ReactMouseEvent<SVGGElement, MouseEvent>) => void;
  type: string;
}

const EdgeUpdaterClassName = "react-flow__edgeupdater";

export const EdgeAnchor: FC<EdgeAnchorProps> = ({
  position,
  centerX,
  centerY,
  radius = 10,
  onMouseDown,
  onMouseEnter,
  onMouseOut,
  type,
}: EdgeAnchorProps) => (
  <circle
    onMouseDown={onMouseDown}
    onMouseEnter={onMouseEnter}
    onMouseOut={onMouseOut}
    className={`${EdgeUpdaterClassName} ${EdgeUpdaterClassName}-${type}`}
    cx={shiftX(centerX, radius, position)}
    cy={shiftY(centerY, radius, position)}
    r={radius}
    stroke="transparent"
    fill="transparent"
  />
);
