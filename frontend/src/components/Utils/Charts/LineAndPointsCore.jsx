import { AxisBottom, AxisLeft } from "@visx/axis";
import * as allCurves from "@visx/curve";
import { Group } from "@visx/group";
import { Bar, LinePath } from "@visx/shape";
import _ from "lodash";
import React from "react";
import { AxisWithZoom } from "./AxisWithZoom";
import { useAnimatedScale } from "./useAnimatedScale";
import { useTooltipMouseOverHandler } from "./useTooltipMouseOverHandler";

function _LineAndPointsCore({
  showPoints,
  series,
  xMax,
  yMax,
  curveType,
  showTooltip,
  hideTooltip,
  colorScale,
  margin,
  groupTop,
  groupLeft,
}) {
  const xScale = useAnimatedScale({
    maxPixelRange: xMax,
    series,
    attr: "x",
    pixelRangeIncreases: true,
  });
  const yScale = useAnimatedScale({
    maxPixelRange: yMax,
    series,
    attr: "y",
    pixelRangeIncreases: false,
  });
  const handleMouseOver = useTooltipMouseOverHandler({
    showTooltip,
    xScale,
    yScale,
    margin,
    series,
  });

  return series.map((lineData, i) => (
    <Group key={`lines-${i}`} top={groupTop} left={groupLeft}>
      {showPoints &&
        lineData.values.map((d, j) => (
          <circle
            key={j}
            r={5}
            cx={xScale(d.x)}
            cy={yScale(d.y)}
            stroke={colorScale(lineData.name)}
            fill={colorScale(lineData.name)}
          />
        ))}
      <AxisWithZoom childKey="AxisLeft">
        <AxisLeft
          scale={yScale}
          hideAxisLine
          hideTicks
          // labelClassName="fill-setta-500 dark:fill-setta-300 font-sans"
          left={-8}
          tickClassName="[&_*]:fill-setta-500  dark:text-setta-300 font-sans"
        />
      </AxisWithZoom>
      <AxisWithZoom childKey="AxisBottom">
        <AxisBottom
          scale={xScale}
          top={yMax + 8}
          hideAxisLine
          hideTicks
          tickClassName="[&_*]:fill-setta-500  dark:text-setta-300 font-sans"
        />
      </AxisWithZoom>
      <LinePath
        curve={allCurves[curveType]}
        data={lineData.values}
        x={(d) => xScale(d.x) ?? 0}
        y={(d) => yScale(d.y) ?? 0}
        stroke={colorScale(lineData.name)}
        strokeWidth={4}
        strokeOpacity={0.6}
        shapeRendering="geometricPrecision"
        markerMid="url(#marker-circle)"
      />
      <Bar
        x={0}
        y={0}
        width={xMax}
        height={yMax}
        fill="transparent"
        onTouchStart={handleMouseOver}
        onTouchMove={handleMouseOver}
        onMouseMove={handleMouseOver}
        onMouseLeave={hideTooltip}
      />
    </Group>
  ));
}

export const LineAndPointsCore = React.memo(_LineAndPointsCore, _.isEqual);
