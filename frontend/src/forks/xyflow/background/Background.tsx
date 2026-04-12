import { memo, useEffect, useRef } from "react";
import { useLocalStorage, useSettings } from "state/definitions";
import { BackgroundVariantEnum } from "utils/generatedTypes";
import { useReactFlow } from "../core/store";
import { DotPattern, LinePattern } from "./Patterns";

function Background() {
  const offset = 2;
  const darkMode = useLocalStorage((x) => x.darkMode);
  const patternColor = useSettings((x) =>
    darkMode ? x.gui.gridColorDarkMode : x.gui.gridColor,
  );
  const patternSize = useSettings((x) => x.gui.gridPatternSize);
  const gapXY: [number, number] = useSettings((x) => x.gui.snapGrid);
  const variant = useSettings((x) => x.gui.gridPattern);
  const ref = useRef<SVGSVGElement>(null);

  const isDots = variant === BackgroundVariantEnum.dots;
  const isCross = variant === BackgroundVariantEnum.cross;

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
      ref={ref}
      data-testid="rf__background"
    >
      <BackgroundCore
        offset={offset}
        gapXY={gapXY}
        patternColor={patternColor}
        patternSize={patternSize}
        isCross={isCross}
        isDots={isDots}
      />
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#ReactFlowBackground)`}
      />
    </svg>
  );
}

Background.displayName = "Background";

export default memo(Background);

type BackgroundCoreProps = {
  offset: number;
  gapXY: [number, number];
  patternColor: string;
  patternSize: number;
  isCross: boolean;
  isDots: boolean;
};

type BackgroundPatternAttributes = {
  lineWidth: number;
  pathData: string;
  patternHeight: number;
  patternOffsetX: number;
  patternOffsetY: number;
  patternWidth: number;
  radius: number;
  x: number;
  y: number;
};

export function getBackgroundPatternAttributes(
  transform: [number, number, number],
  {
    gapXY,
    patternSize,
    isCross,
    isDots,
    offset,
  }: Pick<
    BackgroundCoreProps,
    "gapXY" | "patternSize" | "isCross" | "isDots" | "offset"
  >,
): BackgroundPatternAttributes {
  const scaledGap: [number, number] = [
    gapXY[0] * transform[2] || 1,
    gapXY[1] * transform[2] || 1,
  ];
  const scaledSize = patternSize * transform[2];

  const patternDimensions: [number, number] = isCross
    ? [scaledSize, scaledSize]
    : scaledGap;

  const patternOffset: [number, number] = isDots
    ? [scaledSize / offset, scaledSize / offset]
    : [patternDimensions[0] / offset, patternDimensions[1] / offset];

  return {
    x: transform[0] % scaledGap[0],
    y: transform[1] % scaledGap[1],
    patternWidth: scaledGap[0],
    patternHeight: scaledGap[1],
    patternOffsetX: patternOffset[0],
    patternOffsetY: patternOffset[1],
    radius: scaledSize / offset,
    lineWidth: patternSize * transform[2],
    pathData: `M${patternDimensions[0] / 2} 0 V${patternDimensions[1]} M0 ${patternDimensions[1] / 2} H${patternDimensions[0]}`,
  };
}

export const BackgroundCore = memo(
  ({
    offset,
    gapXY,
    patternColor,
    patternSize,
    isCross,
    isDots,
  }: BackgroundCoreProps) => {
    const patternRef = useRef<SVGPatternElement | null>(null);
    const dotRef = useRef<SVGCircleElement | null>(null);
    const lineRef = useRef<SVGPathElement | null>(null);
    const attributes = getBackgroundPatternAttributes(
      useReactFlow.getState().transform,
      {
        gapXY,
        patternSize,
        isCross,
        isDots,
        offset,
      },
    );

    useEffect(() => {
      const syncTransform = (transform: [number, number, number]) => {
        const pattern = patternRef.current;
        if (!pattern) {
          return;
        }

        const nextAttributes = getBackgroundPatternAttributes(transform, {
          gapXY,
          patternSize,
          isCross,
          isDots,
          offset,
        });

        pattern.setAttribute("x", `${nextAttributes.x}`);
        pattern.setAttribute("y", `${nextAttributes.y}`);
        pattern.setAttribute("width", `${nextAttributes.patternWidth}`);
        pattern.setAttribute("height", `${nextAttributes.patternHeight}`);
        pattern.setAttribute(
          "patternTransform",
          `translate(-${nextAttributes.patternOffsetX},-${nextAttributes.patternOffsetY})`,
        );

        if (isDots) {
          const dot = dotRef.current;
          if (!dot) {
            return;
          }

          dot.setAttribute("cx", `${nextAttributes.radius}`);
          dot.setAttribute("cy", `${nextAttributes.radius}`);
          dot.setAttribute("r", `${nextAttributes.radius}`);
          return;
        }

        const line = lineRef.current;
        if (!line) {
          return;
        }

        line.setAttribute("stroke-width", `${nextAttributes.lineWidth}`);
        line.setAttribute("d", nextAttributes.pathData);
      };

      syncTransform(useReactFlow.getState().transform);

      return useReactFlow.subscribe((state) => state.transform, syncTransform);
    }, [gapXY, isCross, isDots, offset, patternSize]);

    return (
      <pattern
        id="ReactFlowBackground"
        x={attributes.x}
        y={attributes.y}
        width={attributes.patternWidth}
        height={attributes.patternHeight}
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(-${attributes.patternOffsetX},-${attributes.patternOffsetY})`}
        ref={patternRef}
      >
        {isDots ? (
          <DotPattern
            color={patternColor}
            radius={attributes.radius}
            ref={dotRef}
          />
        ) : (
          <LinePattern
            dimensions={[0, 0]}
            color={patternColor}
            lineWidth={attributes.lineWidth}
            pathData={attributes.pathData}
            ref={lineRef}
          />
        )}
      </pattern>
    );
  },
);
