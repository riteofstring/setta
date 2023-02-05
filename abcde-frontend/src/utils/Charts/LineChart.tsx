import * as allCurves from "@visx/curve";
import { Group } from "@visx/group";
import {
  MarkerArrow,
  MarkerCircle,
  MarkerCross,
  MarkerLine,
  MarkerX,
} from "@visx/marker";
import generateDateValue, {
  DateValue,
} from "@visx/mock-data/lib/generators/genDateValue";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { extent, max } from "d3-array";

const lineCount = 5;
const series = new Array(lineCount).fill(null).map((_, i) =>
  // vary each series value deterministically
  generateDateValue(25, /* seed= */ i / 72).sort(
    (a: DateValue, b: DateValue) => a.date.getTime() - b.date.getTime()
  )
);
const allData = series.reduce((rec, d) => rec.concat(d), []);

// data accessors
const getX = (d: DateValue) => d.date;
const getY = (d: DateValue) => d.value;

// scales
const xScale = scaleTime<number>({
  domain: extent(allData, getX) as [Date, Date],
});
const yScale = scaleLinear<number>({
  domain: [0, max(allData, getY) as number],
});


console.log("test data", series)

export type CurveProps = {
  width: number;
  height: number;
  series,
  curveType?: string;
  showPoints?: boolean;
};

export function LineChart({
  width,
  height,
//   series,
  curveType = "curveLinear",
  showPoints = true,
}: CurveProps) {
  const lineHeight = height / lineCount;

  // update scale output ranges
  xScale.range([0, width - 50]);
  yScale.range([lineHeight - 2, 0]);

  console.log("xScale", xScale)

  return (
    <div className="visx-curves-demo">
      <svg width={width} height={height}>
        <rect width={width} height={height} fill="#efefef" rx={14} ry={14} />
        {width > 8 &&
          series.map((lineData, i) => {
            return (
              <Group key={`lines-${i}`} top={i * lineHeight} left={13}>
                {showPoints &&
                  lineData.map((d, j) => (
                    <circle
                      key={i + j}
                      r={3}
                      cx={xScale(getX(d))}
                      cy={yScale(getY(d))}
                      stroke="rgba(33,33,33,0.5)"
                      fill="transparent"
                    />
                  ))}
                <LinePath<DateValue>
                  curve={allCurves[curveType]}
                  data={lineData}
                  x={(d) => xScale(getX(d)) ?? 0}
                  y={(d) => yScale(getY(d)) ?? 0}
                  stroke="#333"
                  strokeWidth={2}
                  strokeOpacity={0.6}
                  shapeRendering="geometricPrecision"
                  markerMid="url(#marker-circle)"
                />
              </Group>
            );
          })}
      </svg>
      <style jsx>{`
        .visx-curves-demo label {
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
