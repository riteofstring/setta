import { AxisBottom, AxisLeft } from "@visx/axis";
import * as allCurves from "@visx/curve";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { LegendOrdinal } from "@visx/legend";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar, Line, LinePath } from "@visx/shape";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { bisector, extent } from "d3-array";
import { schemeSet1 } from "d3-scale-chromatic";

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
  series;
  curveType?: string;
  showPoints?: boolean;
  margin?: { top: number; right: number; bottom: number; left: number };
  legendHeight?: number;
};

export function LineChart({
  width,
  height,
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
  const groupTop = margin.top;
  const groupLeft = margin.left;

  // scales
  const xScale = scaleLinear<number>({
    domain: extent([].concat(...series.map((s) => s.values.map((v) => v.x)))),
    range: [0, xMax],
  });
  const yScale = scaleLinear<number>({
    domain: extent([].concat(...series.map((s) => s.values.map((v) => v.y)))),
    range: [yMax, 0],
  });

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip();

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

  const colorScale = scaleOrdinal({
    domain: series.map((x) => x.name),
    range: schemeSet1,
  });

  return (
    <div style={{ position: "relative" }}>
      <svg width={width} height={svgHeight}>
        <rect
          width={width}
          height={rectHeight}
          fill="#ffffff"
          rx={14}
          ry={14}
        />
        {series.map((lineData, i) => {
          return (
            <Group key={`lines-${i}`} top={groupTop} left={groupLeft}>
              {showPoints &&
                lineData.values.map((d, j) => (
                  <circle
                    key={i + j}
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
          );
        })}
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
            {/* <circle
              cx={tooltipLeft}
              cy={tooltipTop + 1}
              r={4}
              fill="black"
              fillOpacity={0.1}
              stroke="black"
              strokeOpacity={0.1}
              strokeWidth={2}
              pointerEvents="none"
            /> */}
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
