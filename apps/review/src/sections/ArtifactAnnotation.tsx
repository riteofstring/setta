import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  annotationPath,
  appendDistinctAnnotationPoint,
  normalizeAnnotationPoint,
  settleAnnotationStroke,
  type ArtifactAnnotationStroke,
  type NormalizedAnnotationPoint,
} from "./artifactAnnotationModel";

type ActiveStroke = {
  pointerId: number;
  points: readonly NormalizedAnnotationPoint[];
  target: SVGSVGElement;
};

export type ArtifactAnnotationProps = Readonly<{
  artifactId: string;
  artifactLabel?: string;
  className?: string;
  drawMode: boolean;
  onClear: (artifactId: string) => void;
  onStrokeComplete: (
    artifactId: string,
    points: readonly NormalizedAnnotationPoint[],
  ) => void;
  strokeColor?: string;
  strokeWidth?: number;
  strokes: readonly ArtifactAnnotationStroke[];
  style?: CSSProperties;
}>;

function releaseCapture(activeStroke: ActiveStroke): void {
  if (activeStroke.target.hasPointerCapture(activeStroke.pointerId)) {
    activeStroke.target.releasePointerCapture(activeStroke.pointerId);
  }
}

function annotationSurfaceState(
  drawMode: boolean,
  style: CSSProperties | undefined,
) {
  if (drawMode) {
    return {
      description:
        "Draw with a pointer. Press Escape to cancel the current stroke. Press Delete or Backspace to clear annotations.",
      focusable: "true",
      style: {
        ...style,
        cursor: "crosshair",
        pointerEvents: "auto",
        touchAction: "none",
        userSelect: "none",
      } satisfies CSSProperties,
      tabIndex: 0,
    } as const;
  }
  return {
    description: "Drawing mode is off.",
    focusable: "false",
    style: {
      ...style,
      cursor: "default",
      pointerEvents: "none",
      touchAction: style?.touchAction,
      userSelect: "none",
    } satisfies CSSProperties,
    tabIndex: -1,
  } as const;
}

function AnnotationPaths({
  draftPoints,
  strokeColor,
  strokeWidth,
  strokes,
}: Readonly<{
  draftPoints: readonly NormalizedAnnotationPoint[] | null;
  strokeColor: string;
  strokeWidth: number;
  strokes: readonly ArtifactAnnotationStroke[];
}>) {
  return (
    <>
      {strokes.map((stroke) => (
        <path
          d={annotationPath(stroke.points)}
          data-annotation-stroke={stroke.id}
          fill="none"
          key={stroke.id}
          pointerEvents="none"
          stroke={stroke.color ?? strokeColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.width ?? strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {draftPoints ? (
        <path
          d={annotationPath(draftPoints)}
          data-annotation-draft="true"
          fill="none"
          pointerEvents="none"
          stroke={strokeColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </>
  );
}

export function ArtifactAnnotation({
  artifactId,
  artifactLabel = artifactId,
  className,
  drawMode,
  onClear,
  onStrokeComplete,
  strokeColor = "#5ee693",
  strokeWidth = 3,
  strokes,
  style,
}: ArtifactAnnotationProps) {
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const [draftPoints, setDraftPoints] = useState<
    readonly NormalizedAnnotationPoint[] | null
  >(null);

  const cancelActiveStroke = useCallback(() => {
    const activeStroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setDraftPoints(null);
    if (activeStroke) {
      releaseCapture(activeStroke);
    }
  }, []);

  useEffect(() => {
    if (!drawMode) {
      cancelActiveStroke();
    }
    return cancelActiveStroke;
  }, [artifactId, cancelActiveStroke, drawMode]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (
        !drawMode ||
        activeStrokeRef.current ||
        event.button !== 0 ||
        !event.isPrimary
      ) {
        return;
      }
      const point = normalizeAnnotationPoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
      );
      if (!point) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      const points = [point];
      activeStrokeRef.current = {
        pointerId: event.pointerId,
        points,
        target: event.currentTarget,
      };
      setDraftPoints(points);
    },
    [drawMode],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = normalizeAnnotationPoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
      );
      if (!point) {
        return;
      }
      const points = appendDistinctAnnotationPoint(activeStroke.points, point);
      if (points !== activeStroke.points) {
        activeStroke.points = points;
        setDraftPoints(points);
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const finalPoint = normalizeAnnotationPoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
      );
      const points = finalPoint
        ? appendDistinctAnnotationPoint(activeStroke.points, finalPoint)
        : activeStroke.points;
      activeStrokeRef.current = null;
      setDraftPoints(null);
      releaseCapture(activeStroke);
      const settledPoints = settleAnnotationStroke(points);
      if (settledPoints) {
        onStrokeComplete(artifactId, settledPoints);
      }
    },
    [artifactId, onStrokeComplete],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancelActiveStroke();
    },
    [cancelActiveStroke],
  );

  const handleLostPointerCapture = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (activeStrokeRef.current?.pointerId === event.pointerId) {
        cancelActiveStroke();
      }
    },
    [cancelActiveStroke],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (!drawMode) {
        return;
      }
      if (event.key === "Escape" && activeStrokeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancelActiveStroke();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (activeStrokeRef.current || strokes.length > 0)
      ) {
        event.preventDefault();
        event.stopPropagation();
        cancelActiveStroke();
        if (strokes.length > 0) {
          onClear(artifactId);
        }
      }
    },
    [artifactId, cancelActiveStroke, drawMode, onClear, strokes.length],
  );

  const surface = annotationSurfaceState(drawMode, style);

  return (
    <svg
      aria-description={surface.description}
      aria-disabled={!drawMode}
      aria-keyshortcuts="Escape Delete Backspace"
      aria-label={`Annotation canvas for ${artifactLabel}`}
      className={className}
      data-artifact-annotation={artifactId}
      focusable={surface.focusable}
      height="100%"
      onKeyDown={handleKeyDown}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      preserveAspectRatio="none"
      role="img"
      style={surface.style}
      tabIndex={surface.tabIndex}
      viewBox="0 0 1 1"
      width="100%"
    >
      <AnnotationPaths
        draftPoints={draftPoints}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        strokes={strokes}
      />
    </svg>
  );
}
