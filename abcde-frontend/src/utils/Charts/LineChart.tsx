import { AxisBottom, AxisLeft } from "@visx/axis";
import * as allCurves from "@visx/curve";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { LegendOrdinal } from "@visx/legend";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar, Line, LinePath } from "@visx/shape";
import { useTooltip } from "@visx/tooltip";
import { bisector, extent } from "d3-array";
import { schemeSet1 } from "d3-scale-chromatic";

const accentColorDark = "#75daad";
const defaultMargin = { top: 40, right: 30, bottom: 50, left: 40 };
const bisectX = bisector((d) => d.x).center;

type CurveProps = {
  width: number;
  height: number;
  series;
  curveType?: string;
  showPoints?: boolean;
  margin?: { top: number; right: number; bottom: number; left: number };
};

export function LineChart({
  width,
  height,
  series,
  curveType = "curveLinear",
  showPoints = true,
  margin = defaultMargin,
}: CurveProps) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip();

  // scales
  const xScale = scaleLinear<number>({
    domain: extent([].concat(...series.map((s) => s.values.map((v) => v.x)))),
  });
  const yScale = scaleLinear<number>({
    domain: extent([].concat(...series.map((s) => s.values.map((v) => v.y)))),
  });

  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // update scale output ranges
  xScale.range([0, xMax]);
  yScale.range([yMax, 0]);

  function handleMouseOver(event) {
    const { x } = localPoint(event) || { x: 0 };
    const x0 = xScale.invert(x - margin.left);
    const currSeries = series[0].values;
    const index = bisectX(currSeries, x0);
    const d0 = currSeries[index - 1];
    const d1 = currSeries[index];
    let d = d0 ? d0 : d1;
    if (d1 && d1.x) {
      d = x0 - d0.x > d1.x - x0 ? d1 : d0;
    }
    showTooltip({
      tooltipLeft: { line: x, circle: xScale(d.x) + margin.left },
      tooltipTop: yScale(d.y),
      tooltipData: d,
    });
  }

  const colorScale = scaleOrdinal({
    domain: series.map((x) => x.name),
    range: schemeSet1,
  });

  return (
    <div className="visx-curves-demo">
      <svg width={width} height={height}>
        <rect width={width} height={height} fill="#ffffff" rx={14} ry={14} />
        {width > 8 &&
          series.map((lineData, i) => {
            return (
              <Group key={`lines-${i}`} top={margin.top} left={margin.left}>
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
              from={{ x: tooltipLeft.line, y: margin.top }}
              to={{ x: tooltipLeft.line, y: yMax + margin.top }}
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
            <circle
              cx={tooltipLeft.circle}
              cy={tooltipTop + margin.top}
              r={4}
              fill={accentColorDark}
              stroke="white"
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        )}
      </svg>
      {/* {tooltipOpen && (
        <Tooltip
          // set this to random so it correctly updates with parent bounds
          key={Math.random()}
          top={tooltipTop}
          left={tooltipLeft}
        >
          Data value <strong>{tooltipData}</strong>
        </Tooltip>
      )} */}

      <LegendOrdinal
        scale={colorScale}
        direction="row"
        labelMargin="0 15px 0 0"
      />
    </div>
  );
}
