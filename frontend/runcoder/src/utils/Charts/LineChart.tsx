import { LegendItem, LegendLabel, LegendOrdinal } from "@visx/legend";
import { Line } from "@visx/shape";
import { TooltipWithBounds } from "@visx/tooltip";
import { getTooltipText } from "./getTooltipText";
import { LineAndPointsCore } from "./LineAndPointsCore";
import { useColorScale } from "./useColorScale";
import { useCustomTooltip } from "./useCustomTooltip";

const accentColorDark = "#75daad";
const defaultMargin = { top: 50, right: 40, bottom: 60, left: 60 };
const defaultLegendHeight = 30;
const minHeight = 0;
const minWidth = 0;

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

  const {
    tooltipData,
    tooltipLineX,
    tooltipLineY,
    tooltipLocation,
    showTooltip,
    hideTooltip,
  } = useCustomTooltip({
    tooltipLineY: { from: groupTop, to: yMax + groupTop },
  });

  const colorScale = useColorScale(series);

  if (xMax < minWidth || yMax < minHeight) {
    return null;
  }
  //
  const legendGlyphSize = 15;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl ">
        <svg width={width} height={svgHeight}>
          <rect
            width={width}
            height={rectHeight}
            className="fill-transparent"
            rx={10}
            ry={10}
          />
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
            groupTop={groupTop}
            groupLeft={groupLeft}
          />
          {tooltipData && (
            <g>
              <Line
                from={{ x: tooltipLineX, y: tooltipLineY.from }}
                to={{ x: tooltipLineX, y: tooltipLineY.to }}
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
      </div>
      {tooltipData && (
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
      >
        {(labels) => (
          <figcaption className="flex gap-2">
            {labels.map((label, i) => (
              <LegendItem key={`legend-quantile-${i}`} margin="0 5px">
                <svg width={legendGlyphSize} height={legendGlyphSize}>
                  <circle
                    fill={label.value}
                    // width={legendGlyphSize}
                    // height={legendGlyphSize}
                    cx="7.5"
                    cy="7.5"
                    r="7.5"
                  />
                </svg>
                <LegendLabel
                  align="left"
                  margin="0 0 0 4px"
                  className="text-xs text-runcoder-500 dark:text-runcoder-400"
                >
                  {label.text}
                </LegendLabel>
              </LegendItem>
            ))}
          </figcaption>
        )}
      </LegendOrdinal>
    </div>
  );
}

// function generateNewTestData() {
//   updateOutput({
//     group: { id: "67863f2c-9916-4d9b-9c60-b7ed3781f49d", name: "wave" },
//     key: { id: "35ddd5b3-a87d-408b-b140-4144d0b2076f", name: "sin(x)" },
//     values: [Math.random() * (Math.random() * 5)],
//   });
// }
