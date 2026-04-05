import { DotPattern, LinePattern } from "forks/xyflow/background/Patterns";
import { memo, useId } from "react";
import { useLocalStorage, useSettings } from "state/definitions";
import { BackgroundVariantEnum } from "utils/generatedTypes";
import type { GraphViewport } from "./viewportTransform";

const DEFAULT_VIEWPORT: GraphViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};
const PATTERN_OFFSET = 2;

type SettingsGraphSubstrateCanaryBackgroundProps = {
  viewport: GraphViewport | null;
};

type SettingsGraphSubstrateCanaryBackgroundPattern = {
  isCross: boolean;
  isDots: boolean;
  patternDimensions: [number, number];
  patternId: string;
  patternOffset: [number, number];
  patternPosition: [number, number];
  scaledGap: [number, number];
  scaledSize: number;
};

export function resolveSettingsGraphSubstrateCanaryBackgroundPattern({
  gapXY,
  patternId,
  patternSize,
  variant,
  viewport,
}: {
  gapXY: [number, number];
  patternId: string;
  patternSize: number;
  variant: string;
  viewport: GraphViewport | null;
}): SettingsGraphSubstrateCanaryBackgroundPattern {
  const resolvedViewport = viewport ?? DEFAULT_VIEWPORT;
  const zoom = resolvedViewport.zoom > 0 ? resolvedViewport.zoom : 1;
  const scaledGap: [number, number] = [
    getScaledGapDimension(gapXY[0], zoom),
    getScaledGapDimension(gapXY[1], zoom),
  ];
  const scaledSize = patternSize * zoom;
  const isDots = variant === BackgroundVariantEnum.dots;
  const isCross = variant === BackgroundVariantEnum.cross;
  const patternDimensions: [number, number] = isCross
    ? [scaledSize, scaledSize]
    : scaledGap;
  const patternOffset: [number, number] = isDots
    ? [scaledSize / PATTERN_OFFSET, scaledSize / PATTERN_OFFSET]
    : [
        patternDimensions[0] / PATTERN_OFFSET,
        patternDimensions[1] / PATTERN_OFFSET,
      ];

  return {
    isCross,
    isDots,
    patternDimensions,
    patternId,
    patternOffset,
    patternPosition: [
      resolvedViewport.x % scaledGap[0],
      resolvedViewport.y % scaledGap[1],
    ],
    scaledGap,
    scaledSize,
  };
}

function _SettingsGraphSubstrateCanaryBackground({
  viewport,
}: SettingsGraphSubstrateCanaryBackgroundProps) {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const patternColor = useSettings((state) =>
    darkMode ? state.gui.gridColorDarkMode : state.gui.gridColor,
  );
  const patternSize = useSettings((state) => state.gui.gridPatternSize);
  const gapXY: [number, number] = useSettings((state) => state.gui.snapGrid);
  const variant = useSettings((state) => state.gui.gridPattern);
  const patternId = `graph-substrate-canary-background-${useId().replaceAll(
    ":",
    "",
  )}`;
  const pattern = resolveSettingsGraphSubstrateCanaryBackgroundPattern({
    gapXY,
    patternId,
    patternSize,
    variant,
    viewport,
  });

  return (
    <svg
      aria-hidden="true"
      className="react-flow__background"
      data-testid="rf__background"
      style={{
        height: "100%",
        left: 0,
        position: "absolute",
        top: 0,
        width: "100%",
      }}
    >
      <pattern
        id={pattern.patternId}
        x={pattern.patternPosition[0]}
        y={pattern.patternPosition[1]}
        width={pattern.scaledGap[0]}
        height={pattern.scaledGap[1]}
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(-${pattern.patternOffset[0]},-${pattern.patternOffset[1]})`}
      >
        {pattern.isDots ? (
          <DotPattern color={patternColor} radius={pattern.scaledSize / 2} />
        ) : (
          <LinePattern
            color={patternColor}
            dimensions={pattern.patternDimensions}
            lineWidth={pattern.scaledSize}
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
}

export const SettingsGraphSubstrateCanaryBackground = memo(
  _SettingsGraphSubstrateCanaryBackground,
);

function getScaledGapDimension(gap: number, zoom: number) {
  const scaledGap = gap * zoom;
  if (scaledGap > 0) {
    return scaledGap;
  }
  return 1;
}
