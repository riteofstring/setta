import { forwardRef } from "react";

export const LinePattern = forwardRef<
  SVGPathElement,
  {
    dimensions: [number, number];
    lineWidth?: number;
    color: string;
    pathData?: string;
  }
>(function LinePattern({ color, dimensions, lineWidth, pathData }, ref) {
  return (
    <path
      ref={ref}
      stroke={color}
      strokeWidth={lineWidth}
      d={
        pathData ??
        `M${dimensions[0] / 2} 0 V${dimensions[1]} M0 ${dimensions[1] / 2} H${dimensions[0]}`
      }
    />
  );
});

export const DotPattern = forwardRef<
  SVGCircleElement,
  {
    radius: number;
    color: string;
  }
>(function DotPattern({ color, radius }, ref) {
  return <circle ref={ref} cx={radius} cy={radius} r={radius} fill={color} />;
});
