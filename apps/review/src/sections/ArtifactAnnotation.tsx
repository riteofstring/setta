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

  const label = `Annotation canvas for ${artifactLabel}`;
  const instructions = drawMode
    ? "Draw with a pointer. Press Escape to cancel the current stroke. Press Delete or Backspace to clear annotations."
    : "Drawing mode is off.";

  return (
    <svg
      aria-description={instructions}
      aria-disabled={!drawMode}
      aria-keyshortcuts="Escape Delete Backspace"
      aria-label={label}
      className={className}
      data-artifact-annotation={artifactId}
      focusable={drawMode ? "true" : "false"}
      height="100%"
      onKeyDown={handleKeyDown}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      preserveAspectRatio="none"
      role="img"
      style={{
        ...style,
        cursor: drawMode ? "crosshair" : "default",
        pointerEvents: drawMode ? "auto" : "none",
        touchAction: drawMode ? "none" : style?.touchAction,
        userSelect: "none",
      }}
      tabIndex={drawMode ? 0 : -1}
      viewBox="0 0 1 1"
      width="100%"
    >
      {strokes.map((stroke) => (
        <path
          d={annotationPath(stroke.points)}
          data-annotation-stroke={stroke.id}
          fill="none"
          key={stroke.id}
          pointerEvents="none"
          stroke={strokeColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
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
    </svg>
  );
}
