import { AxisBottom, AxisLeft } from "@visx/axis";
import * as allCurves from "@visx/curve";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { LegendOrdinal } from "@visx/legend";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar, Line, LinePath } from "@visx/shape";
import { Text } from "@visx/text";
import { TooltipWithBounds } from "@visx/tooltip";
import { bisector } from "d3-array";
import { schemeSet1 } from "d3-scale-chromatic";
import { animate, useMotionValue } from "framer-motion";
import _ from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { updateOutput } from "thunks/outputs";

const accentColorDark = "#75daad";
const defaultMargin = { top: 40, right: 30, bottom: 50, left: 40 };
const defaultLegendHeight = 30;
const bisectX = bisector((d) => d.x).center;

type CurveProps = {
  width: number;
  height: number;
  title: string;
  series;
  curveType?: string;
  showPoints?: boolean;
  margin?: { top: number; right: number; bottom: number; left: number };
  legendHeight?: number;
};

export function LineChart({
  width,
  height,
  title,
  series,
  curveType = "curveLinear",
  showPoints = true,
  margin = defaultMargin,
  legendHeight = defaultLegendHeight,
}: CurveProps) {
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom - legendHeight;
  const svgHeight = height - legendHeight;
  const rectHeight = svgHeight;

  const {
    tooltipData,
    tooltipLine,
    tooltipLocation,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useCustomTooltip();

  const colorScale = useColorScale(series);

  return (
    <div style={{ position: "relative" }} onClick={() => generateNewTestData()}>
      <svg width={width} height={svgHeight}>
        <rect
          width={width}
          height={rectHeight}
          fill="#ffffff"
          rx={14}
          ry={14}
        />
        <Text textAnchor="start" verticalAnchor="start">
          {title}
        </Text>
        <LineAndPointsCore
          showPoints={showPoints}
          series={series}
          xMax={xMax}
          yMax={yMax}
          curveType={curveType}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
          colorScale={colorScale}
          margin={margin}
        />
        {tooltipData && (
          <g>
            <Line
              from={{ x: tooltipLine.x, y: tooltipLine.yFrom }}
              to={{ x: tooltipLine.x, y: tooltipLine.yTo }}
              stroke={accentColorDark}
              strokeWidth={2}
              pointerEvents="none"
              strokeDasharray="5,2"
            />
            {tooltipData.map((d, idx) => (
              <circle
                cx={d.x}
                cy={d.y}
                r={4}
                fill={accentColorDark}
                stroke="white"
                strokeWidth={2}
                pointerEvents="none"
                key={`circle-${idx}`}
              />
            ))}
          </g>
        )}
      </svg>
      {tooltipOpen && (
        <TooltipWithBounds
          key={Math.random()}
          top={tooltipLocation.y}
          left={tooltipLocation.x}
        >
          {getTooltipText(tooltipData)}
        </TooltipWithBounds>
      )}

      <LegendOrdinal
        scale={colorScale}
        direction="row"
        labelMargin="0 15px 0 0"
        style={{ height: legendHeight, display: "flex" }}
      />
    </div>
  );
}

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
}) {
  const groupTop = margin.top;
  const groupLeft = margin.left;

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
    yMax,
    groupTop,
    margin,
    series,
  });

  return series.map((lineData, i) => (
    <Group key={`lines-${i}`} top={groupTop} left={groupLeft}>
      {showPoints &&
        lineData.values.map((d, j) => (
          <circle
            key={j}
            r={2}
            cx={xScale(d.x)}
            cy={yScale(d.y)}
            stroke={colorScale(lineData.name)}
            fill={colorScale(lineData.name)}
          />
        ))}
      <AxisLeft scale={yScale} />
      <AxisBottom scale={xScale} top={yMax} />
      <LinePath
        curve={allCurves[curveType]}
        data={lineData.values}
        x={(d) => xScale(d.x) ?? 0}
        y={(d) => yScale(d.y) ?? 0}
        stroke={colorScale(lineData.name)}
        strokeWidth={2}
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
        rx={14}
        onTouchStart={handleMouseOver}
        onTouchMove={handleMouseOver}
        onMouseMove={handleMouseOver}
        onMouseLeave={hideTooltip}
      />
    </Group>
  ));
}

const LineAndPointsCore = React.memo(_LineAndPointsCore, _.isEqual);

function generateNewTestData() {
  updateOutput({
    group: { id: "67863f2c-9916-4d9b-9c60-b7ed3781f49d", name: "wave" },
    key: { id: "35ddd5b3-a87d-408b-b140-4144d0b2076f", name: "sin(x)" },
    values: [Math.random() * (Math.random() * 5)],
  });
}

function useAnimatedScale({
  maxPixelRange,
  series,
  attr,
  pixelRangeIncreases,
}) {
  const allValues: number[] = [].concat(
    ...series.map((s) => s.values.map((v) => v[attr]))
  );

  const lowerBound = useScaleMotionValue({ isMin: true, allValues });
  const upperBound = useScaleMotionValue({ isMin: false, allValues });

  const scale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [lowerBound, upperBound],
        range: pixelRangeIncreases ? [0, maxPixelRange] : [maxPixelRange, 0],
      }),
    [lowerBound, upperBound, maxPixelRange]
  );

  return scale;
}

function useScaleMotionValue({ isMin, allValues }) {
  const currVal = isMin ? Math.min(...allValues) : Math.max(...allValues);
  const motionValue = useMotionValue(currVal);
  const [scaleState, setScaleState] = useState(motionValue.get());

  useEffect(() => {
    animate(motionValue, currVal, { delay: 0 });
  }, [currVal]);

  useEffect(() => {
    const unsubscribe = motionValue.onChange(setScaleState);
    return unsubscribe;
  }, []);

  return scaleState;
}

function useColorScale(series) {
  const seriesNames = series.map((x) => x.name);
  return useMemo(
    () =>
      scaleOrdinal({
        domain: seriesNames,
        range: schemeSet1,
      }),
    [JSON.stringify(seriesNames)]
  );
}

const twoDecimalsFormat = new Intl.NumberFormat("en", {
  notation: "standard",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function getTooltipText(tooltipData) {
  return tooltipData.map((d, i) => (
    <div key={i}>
      {`${d.name}: ${twoDecimalsFormat.format(d.y)}`}
      <br />
    </div>
  ));
}

function useCustomTooltip() {
  const [tooltipState, setTooltipState] = useState({
    tooltipOpen: false,
    tooltipLine: undefined,
    tooltipData: undefined,
    tooltipLocation: undefined,
  });

  const showTooltip = useCallback(
    ({ tooltipLine, tooltipData, tooltipLocation }) =>
      setTooltipState({
        tooltipOpen: true,
        tooltipLine,
        tooltipData,
        tooltipLocation,
      }),
    [setTooltipState]
  );

  const hideTooltip = useCallback(
    () =>
      setTooltipState({
        tooltipOpen: false,
        tooltipLine: undefined,
        tooltipData: undefined,
        tooltipLocation: undefined,
      }),
    [setTooltipState]
  );

  return {
    tooltipOpen: tooltipState.tooltipOpen,
    tooltipLine: tooltipState.tooltipLine,
    tooltipData: tooltipState.tooltipData,
    tooltipLocation: tooltipState.tooltipLocation,
    showTooltip,
    hideTooltip,
  };
}

function getDatapointFromX(name, values, x, xScale, yScale, margin) {
  const index = bisectX(values, x);
  const d0 = values[index - 1];
  const d1 = values[index];
  let d = d0 ? d0 : d1;
  if (d1 && d1.x) {
    d = x - d0.x > d1.x - x ? d1 : d0;
  }
  return {
    name,
    data: d,
    x: xScale(d.x) + margin.left,
    y: yScale(d.y) + margin.top,
  };
}

function useTooltipMouseOverHandler({
  showTooltip,
  xScale,
  yScale,
  yMax,
  groupTop,
  margin,
  series,
}) {
  return useCallback(
    (event) => {
      const { x, y } = localPoint(event) || { x: 0 };
      const x0 = xScale.invert(x - margin.left);
      const ds = series.map((s) =>
        getDatapointFromX(s.name, s.values, x0, xScale, yScale, margin)
      );

      showTooltip({
        tooltipLine: { x, yFrom: groupTop, yTo: yMax + groupTop },
        tooltipData: ds,
        tooltipLocation: { x, y },
      });
    },
    [
      xScale,
      yScale,
      yMax,
      groupTop,
      margin.top,
      margin.left,
      margin.right,
      margin.bottom,
    ]
  );
}
