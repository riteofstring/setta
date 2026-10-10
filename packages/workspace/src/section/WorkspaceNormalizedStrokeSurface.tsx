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
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../interaction";

const MAXIMUM_STROKE_POINTS = 1_024;

export type WorkspaceNormalizedPoint = Readonly<{
  x: number;
  y: number;
}>;

export type WorkspaceNormalizedStroke = Readonly<{
  className?: string;
  color?: string;
  id: string;
  points: readonly WorkspaceNormalizedPoint[];
  width?: number;
}>;

export type WorkspaceNormalizedStrokeSurfaceProps = Readonly<{
  ariaLabel: string;
  className?: string;
  draftClassName?: string;
  enabled: boolean;
  onClear?: () => void;
  onStrokeComplete: (points: readonly WorkspaceNormalizedPoint[]) => void;
  resetKey?: number | string;
  strokeColor?: string;
  strokeWidth?: number;
  strokes: readonly WorkspaceNormalizedStroke[];
  style?: CSSProperties;
}>;

type ActiveStroke = {
  pointerId: number;
  points: readonly WorkspaceNormalizedPoint[];
  target: SVGSVGElement;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

function releasePointerCapture(activeStroke: ActiveStroke): void {
  if (activeStroke.target.hasPointerCapture(activeStroke.pointerId)) {
    activeStroke.target.releasePointerCapture(activeStroke.pointerId);
  }
}

function normalizePoint(
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  requireContained: boolean,
): WorkspaceNormalizedPoint | null {
  if (
    ![
      clientX,
      clientY,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
    ].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }
  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;
  if (requireContained && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function appendPoint(
  points: readonly WorkspaceNormalizedPoint[],
  point: WorkspaceNormalizedPoint,
): readonly WorkspaceNormalizedPoint[] {
  const previous = points.at(-1);
  if (
    points.length >= MAXIMUM_STROKE_POINTS ||
    (previous && previous.x === point.x && previous.y === point.y)
  ) {
    return points;
  }
  return [...points, point];
}

function settleStroke(
  points: readonly WorkspaceNormalizedPoint[],
): readonly WorkspaceNormalizedPoint[] | null {
  return points.length < 2
    ? null
    : points.map((point) => ({ x: point.x, y: point.y }));
}

function strokePath(points: readonly WorkspaceNormalizedPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function StrokePath({
  className,
  color,
  draft,
  id,
  points,
  width,
}: WorkspaceNormalizedStroke & { draft: boolean }) {
  return (
    <path
      className={className}
      d={strokePath(points)}
      data-workspace-normalized-stroke={id}
      data-workspace-normalized-stroke-draft={draft ? "true" : undefined}
      fill="none"
      pointerEvents="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={width}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function surfaceStyle(
  enabled: boolean,
  style: CSSProperties | undefined,
): CSSProperties {
  return {
    ...style,
    cursor: enabled ? (style?.cursor ?? "crosshair") : "default",
    pointerEvents: enabled ? "auto" : "none",
    touchAction: enabled ? "none" : style?.touchAction,
    userSelect: "none",
  };
}

export function WorkspaceNormalizedStrokeSurface({
  ariaLabel,
  className,
  draftClassName,
  enabled,
  onClear,
  onStrokeComplete,
  resetKey,
  strokeColor = "currentColor",
  strokeWidth = 2,
  strokes,
  style,
}: WorkspaceNormalizedStrokeSurfaceProps) {
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const [draftPoints, setDraftPoints] = useState<
    readonly WorkspaceNormalizedPoint[] | null
  >(null);
  const cancelActiveStroke = useCallback(() => {
    const activeStroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setDraftPoints(null);
    if (activeStroke) releasePointerCapture(activeStroke);
  }, []);

  useEffect(() => {
    if (!enabled) cancelActiveStroke();
    return cancelActiveStroke;
  }, [cancelActiveStroke, enabled, resetKey]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (
        !enabled ||
        activeStrokeRef.current ||
        event.button !== 0 ||
        event.isPrimary === false
      ) {
        return;
      }
      const point = normalizePoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        true,
      );
      if (!point) return;
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
    [enabled],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const point = normalizePoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        false,
      );
      if (!point) return;
      const points = appendPoint(activeStroke.points, point);
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
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const point = normalizePoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        false,
      );
      const points = point
        ? appendPoint(activeStroke.points, point)
        : activeStroke.points;
      activeStrokeRef.current = null;
      setDraftPoints(null);
      releasePointerCapture(activeStroke);
      const settled = settleStroke(points);
      if (settled) onStrokeComplete(settled);
    },
    [onStrokeComplete],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      cancelActiveStroke();
    },
    [cancelActiveStroke],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (!enabled) return;
      if (event.key === "Escape" && activeStrokeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancelActiveStroke();
        return;
      }
      if (
        onClear &&
        ["Delete", "Backspace"].includes(event.key) &&
        (activeStrokeRef.current || strokes.length > 0)
      ) {
        event.preventDefault();
        event.stopPropagation();
        cancelActiveStroke();
        if (strokes.length > 0) onClear();
      }
    },
    [cancelActiveStroke, enabled, onClear, strokes.length],
  );

  return (
    <svg
      aria-description={
        enabled
          ? "Draw with a pointer. Press Escape to cancel the current stroke."
          : "Drawing mode is off."
      }
      aria-disabled={!enabled}
      aria-keyshortcuts={onClear ? "Escape Delete Backspace" : "Escape"}
      aria-label={ariaLabel}
      className={joinClassNames(
        className,
        NO_DRAG_CLASS_NAME,
        NO_PAN_CLASS_NAME,
        NO_WHEEL_CLASS_NAME,
      )}
      data-workspace-normalized-stroke-surface="true"
      focusable={enabled ? "true" : "false"}
      height="100%"
      onKeyDown={handleKeyDown}
      onLostPointerCapture={(event) => {
        if (activeStrokeRef.current?.pointerId === event.pointerId) {
          cancelActiveStroke();
        }
      }}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      preserveAspectRatio="none"
      role={enabled ? "application" : "img"}
      style={surfaceStyle(enabled, style)}
      tabIndex={enabled ? 0 : -1}
      viewBox="0 0 1 1"
      width="100%"
    >
      {strokes.map((stroke) => (
        <StrokePath
          {...stroke}
          color={stroke.color ?? strokeColor}
          draft={false}
          key={stroke.id}
          width={stroke.width ?? strokeWidth}
        />
      ))}
      {draftPoints ? (
        <StrokePath
          className={draftClassName}
          color={strokeColor}
          draft
          id="draft"
          points={draftPoints}
          width={strokeWidth}
        />
      ) : null}
    </svg>
  );
}
