import { LegendOrdinal } from "@visx/legend";
import { Line } from "@visx/shape";
import { Text } from "@visx/text";
import { TooltipWithBounds } from "@visx/tooltip";
import { updateOutput } from "thunks/outputs";
import { getTooltipText } from "./getTooltipText";
import { LineAndPointsCore } from "./LineAndPointsCore";
import { useColorScale } from "./useColorScale";
import { useCustomTooltip } from "./useCustomTooltip";

const accentColorDark = "#75daad";
const defaultMargin = { top: 40, right: 30, bottom: 50, left: 40 };
const defaultLegendHeight = 30;

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
      />
    </div>
  );
}

function generateNewTestData() {
  updateOutput({
    group: { id: "67863f2c-9916-4d9b-9c60-b7ed3781f49d", name: "wave" },
    key: { id: "35ddd5b3-a87d-408b-b140-4144d0b2076f", name: "sin(x)" },
    values: [Math.random() * (Math.random() * 5)],
  });
}
