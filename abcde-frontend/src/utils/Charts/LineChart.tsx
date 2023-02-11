import { AxisBottom, AxisLeft } from "@visx/axis";
import * as allCurves from "@visx/curve";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { LegendOrdinal } from "@visx/legend";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar, Line, LinePath } from "@visx/shape";
import { Text } from "@visx/text";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { bisector } from "d3-array";
import { schemeSet1 } from "d3-scale-chromatic";
import { animate, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import { updateOutput } from "thunks/outputs";
import useDeepCompareEffect from "use-deep-compare-effect";

const accentColorDark = "#75daad";
const defaultMargin = { top: 40, right: 30, bottom: 50, left: 40 };
const defaultLegendHeight = 30;
const bisectX = bisector((d) => d.x).center;

function getDatapointFromX(values, x, xScale, yScale, margin) {
  const index = bisectX(values, x);
  const d0 = values[index - 1];
  const d1 = values[index];
  let d = d0 ? d0 : d1;
  if (d1 && d1.x) {
    d = x - d0.x > d1.x - x ? d1 : d0;
  }
  return {
    data: d,
    circle: xScale(d.x) + margin.left,
    top: yScale(d.y) + margin.top,
  };
}

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
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip();

  const colorScale = scaleOrdinal({
    domain: series.map((x) => x.name),
    range: schemeSet1,
  });

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
              from={{ x: tooltipLeft.x, y: tooltipLeft.yFrom }}
              to={{ x: tooltipLeft.x, y: tooltipLeft.yTo }}
              stroke={accentColorDark}
              strokeWidth={2}
              pointerEvents="none"
              strokeDasharray="5,2"
            />
            {tooltipData.map((d, idx) => (
              <circle
                cx={d.circle}
                cy={d.top}
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
      {tooltipOpen &&
        tooltipData.map((d) => (
          <TooltipWithBounds
            key={Math.random()}
            top={d.top}
            left={d.circle}
            //   style={tooltipStyles}
          >
            {`${d.data.y}`}
          </TooltipWithBounds>
        ))}

      <LegendOrdinal
        scale={colorScale}
        direction="row"
        labelMargin="0 15px 0 0"
        style={{ height: legendHeight, display: "flex" }}
      />
    </div>
  );
}

function LineAndPointsCore({
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

  function handleMouseOver(event) {
    const { x } = localPoint(event) || { x: 0 };
    const x0 = xScale.invert(x - margin.left);
    const ds = series.map((s) =>
      getDatapointFromX(s.values, x0, xScale, yScale, margin)
    );

    showTooltip({
      tooltipLeft: { x, yFrom: groupTop, yTo: yMax + groupTop },
      tooltipData: ds,
    });
  }

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
        onMouseLeave={() => hideTooltip()}
      />
    </Group>
  ));
}

function generateNewTestData() {
  updateOutput({
    group: { id: "67863f2c-9916-4d9b-9c60-b7ed3781f49d", name: "wave" },
    key: { id: "35ddd5b3-a87d-408b-b140-4144d0b2076f", name: "sin(x)" },
    values: [Math.random() * (Math.random() * 2)],
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

  const scaleMax = useMotionValue(0);
  const [scaleMaxState, setScaleMaxState] = useState(scaleMax.get());

  const scale = scaleLinear<number>({
    domain: [Math.min(...allValues), scaleMaxState],
    range: pixelRangeIncreases ? [0, maxPixelRange] : [maxPixelRange, 0],
  });

  useDeepCompareEffect(() => {
    animate(scaleMax, Math.max(...allValues), {
      delay: 0,
      //   type: "spring",
    });
  }, [allValues]);

  useEffect(() => {
    const unsubscribe = scaleMax.onChange(setScaleMaxState);
    return unsubscribe;
  }, []);

  return scale;
}
