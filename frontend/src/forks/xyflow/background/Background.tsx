import cc from "classcat";
import _ from "lodash";
import { memo, useRef } from "react";
import { useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { useReactFlow } from "../core/store";
import { DotPattern, LinePattern } from "./Patterns";
import { BackgroundProps, BackgroundVariant } from "./types";

const defaultColor = {
  [BackgroundVariant.Dots]: "",
  [BackgroundVariant.Lines]: "#eee",
  [BackgroundVariant.Cross]: "#e2e2e2",
};

const defaultSize = {
  [BackgroundVariant.Dots]: 1,
  [BackgroundVariant.Lines]: 1,
  [BackgroundVariant.Cross]: 6,
};

function Background({
  id,
  // only used for lines and cross
  lineWidth = 1,
  offset = 2,
  style,
  className,
}: BackgroundProps) {
  const size = 2;
  const [darkMode] = localStorageFns.darkMode.hook();
  const color = darkMode ? "hsl(219, 26%, 18%)" : "hsl(219, 25%, 75%)";
  const variant = BackgroundVariant.Dots;
  const ref = useRef<SVGSVGElement>(null);
  const transform = useReactFlow((x) => x.transform, _.isEqual);
  const patternColor = color || defaultColor[variant];
  const patternSize = size || defaultSize[variant];
  const isDots = variant === BackgroundVariant.Lines;
  const isCross = variant === BackgroundVariant.Cross;
  const gapXY: [number, number] = useSettings((x) => x.snapGrid);
  const scaledGap: [number, number] = [
    gapXY[0] * transform[2] || 1,
    gapXY[1] * transform[2] || 1,
  ];
  const scaledSize = patternSize * transform[2];

  const patternDimensions: [number, number] = isCross
    ? [scaledSize, scaledSize]
    : scaledGap;

  const patternOffset = isDots
    ? [scaledSize / offset, scaledSize / offset]
    : [patternDimensions[0] / offset, patternDimensions[1] / offset];

  return (
    <svg
      className={cc(["react-flow__background", className])}
      style={{
        ...style,
        position: "absolute",
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
      }}
      ref={ref}
      data-testid="rf__background"
    >
      <pattern
        id={`ReactFlowBackground${id}`}
        x={transform[0] % scaledGap[0]}
        y={transform[1] % scaledGap[1]}
        width={scaledGap[0]}
        height={scaledGap[1]}
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(-${patternOffset[0]},-${patternOffset[1]})`}
      >
        {isDots ? (
          <DotPattern color={patternColor} radius={scaledSize / offset} />
        ) : (
          <LinePattern
            dimensions={patternDimensions}
            color={patternColor}
            lineWidth={lineWidth * transform[2]}
          />
        )}
      </pattern>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#ReactFlowBackground${id})`}
      />
    </svg>
  );
}

Background.displayName = "Background";

export default memo(Background);
