import { AxisBottom, AxisLeft } from "@visx/axis";
import * as allCurves from "@visx/curve";
import { Group } from "@visx/group";
import { LegendOrdinal } from "@visx/legend";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { extent } from "d3-array";
import { schemeSet1 } from "d3-scale-chromatic";

const defaultMargin = { top: 40, right: 30, bottom: 50, left: 40 };

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
                      r={3}
                      cx={xScale(d.x)}
                      cy={yScale(d.y)}
                      stroke={colorScale(lineData.name)}
                      fill="transparent"
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
              </Group>
            );
          })}
      </svg>

      <LegendOrdinal
        scale={colorScale}
        direction="row"
        labelMargin="0 15px 0 0"
      />
    </div>
  );
}
