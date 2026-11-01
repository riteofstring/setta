import { memo } from "react";
import { useWorkspaceAppearance } from "../document/stores.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import { getWorkspaceHostDomId } from "../workspaceHostInternals.js";
import { useWorkspaceOptions } from "./options.js";
import { useReactFlow } from "./store.js";

const PATTERN_OFFSET_DIVISOR = 2;

export const WorkspaceBackground = memo(function WorkspaceBackground() {
  const host = useWorkspaceHost();
  const patternId = `${getWorkspaceHostDomId(host)}-background`;
  const snapToGrid = useWorkspaceOptions((state) => state.snapToGrid);
  const showGridLines = useWorkspaceOptions((state) => state.showGridLines);
  const gapXY = useWorkspaceOptions((state) => state.snapGrid);
  const variant = useWorkspaceOptions((state) => state.gridPattern);
  const patternSize = useWorkspaceOptions((state) => state.gridPatternSize);
  const gridColor = useWorkspaceOptions((state) => state.gridColor);
  const gridColorDarkMode = useWorkspaceOptions(
    (state) => state.gridColorDarkMode,
  );
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const transform = useReactFlow((state) => state.transform);

  if (!snapToGrid || !showGridLines) {
    return null;
  }

  const patternColor = darkMode ? gridColorDarkMode : gridColor;
  const scaledGap: [number, number] = [
    gapXY[0] * transform[2] || 1,
    gapXY[1] * transform[2] || 1,
  ];
  const scaledSize = patternSize * transform[2];
  const isDots = variant === "dots";
  const isCross = variant === "cross";
  const patternDimensions: [number, number] = isCross
    ? [scaledSize, scaledSize]
    : scaledGap;
  const patternOffset: [number, number] = isDots
    ? [scaledSize / PATTERN_OFFSET_DIVISOR, scaledSize / PATTERN_OFFSET_DIVISOR]
    : [
        patternDimensions[0] / PATTERN_OFFSET_DIVISOR,
        patternDimensions[1] / PATTERN_OFFSET_DIVISOR,
      ];

  return (
    <svg
      className="react-flow__background"
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
      }}
      data-testid="rf__background"
    >
      <pattern
        id={patternId}
        x={transform[0] % scaledGap[0]}
        y={transform[1] % scaledGap[1]}
        width={scaledGap[0]}
        height={scaledGap[1]}
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(-${patternOffset[0]},-${patternOffset[1]})`}
      >
        {isDots ? (
          <circle
            cx={scaledSize / PATTERN_OFFSET_DIVISOR}
            cy={scaledSize / PATTERN_OFFSET_DIVISOR}
            r={scaledSize / PATTERN_OFFSET_DIVISOR}
            fill={patternColor}
          />
        ) : (
          <path
            stroke={patternColor}
            strokeWidth={patternSize * transform[2]}
            d={`M${patternDimensions[0] / 2} 0 V${patternDimensions[1]} M0 ${patternDimensions[1] / 2} H${patternDimensions[0]}`}
          />
        )}
      </pattern>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#${patternId})`}
      />
    </svg>
  );
});
