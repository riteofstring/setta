import {
  getWorkspaceSavedViewsState,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  useWorkspaceHost,
} from "@setta/workspace";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useLens } from "../app/lensContext";
import type {
  AnnotationPoint,
  AnnotationStroke,
  SelectionAnnotation,
} from "../backend/generatedContract";
import {
  EChartSurface,
  type EChartSurfaceHandle,
  type EChartSurfaceProps,
  type LensChart,
} from "./EChartSurface";

type AnnotationMode = "draw" | "select";

export type NormalizedChartBounds = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export type ChartSelectionGesture = Readonly<{
  additive: boolean;
  bounds: NormalizedChartBounds;
}>;

export type ChartSelectionResolver = (
  gesture: ChartSelectionGesture,
  chart: LensChart,
) => readonly string[];

type AnnotatedChartSurfaceProps = EChartSurfaceProps &
  Readonly<{
    chartFieldIds: readonly string[];
    sectionId: string;
    selectionResolver?: ChartSelectionResolver;
  }>;

function annotationID(): string {
  return `annotation-${window.crypto.randomUUID()}`;
}

function annotationLabel(annotation: SelectionAnnotation): string {
  if (annotation.intent === "question") {
    return "Question";
  }
  if (annotation.intent === "follow-up") {
    return "Follow-up";
  }
  return "Context";
}

function normalizedPoint(
  event: ReactPointerEvent<SVGSVGElement>,
): AnnotationPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
}

function normalizedBounds(
  start: AnnotationPoint,
  end: AnnotationPoint,
): NormalizedChartBounds {
  return {
    bottom: Math.max(start.y, end.y),
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
  };
}

function pointsAttribute(points: readonly AnnotationPoint[]): string {
  return points
    .map((point) => `${String(point.x)},${String(point.y)}`)
    .join(" ");
}

function sameFieldBinding(
  annotation: SelectionAnnotation,
  fieldIds: readonly string[],
): boolean {
  return (
    annotation.chartFieldIds.length === fieldIds.length &&
    annotation.chartFieldIds.every(
      (fieldId, index) => fieldId === fieldIds[index],
    )
  );
}

function AnnotationStrokes({
  annotations,
  draft,
}: {
  annotations: readonly SelectionAnnotation[];
  draft: readonly AnnotationStroke[];
}) {
  return (
    <svg
      aria-hidden="true"
      className="lens-chart-annotation-overlay"
      preserveAspectRatio="none"
      viewBox="0 0 1 1"
    >
      {annotations.flatMap((annotation) =>
        annotation.strokes.map((stroke, index) => (
          <polyline
            className={`lens-chart-annotation-stroke lens-chart-annotation-stroke-${annotation.intent}`}
            data-annotation-id={annotation.id}
            fill="none"
            key={`${annotation.id}:${String(index)}`}
            points={pointsAttribute(stroke.points)}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )}
      {draft.map((stroke, index) => (
        <polyline
          className="lens-chart-annotation-stroke lens-chart-annotation-stroke-draft"
          fill="none"
          key={`draft:${String(index)}`}
          points={pointsAttribute(stroke.points)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function AnnotatedChartSurface({
  chartFieldIds,
  sectionId,
  selectionResolver,
  ...surfaceProps
}: AnnotatedChartSurfaceProps) {
  const lens = useLens();
  const host = useWorkspaceHost();
  const chartRef = useRef<EChartSurfaceHandle | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<AnnotationPoint | null>(null);
  const additiveRef = useRef(false);
  const strokeRef = useRef<AnnotationPoint[]>([]);
  const strokeFrameRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AnnotationMode>(
    selectionResolver ? "select" : "draw",
  );
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<AnnotationPoint[]>([]);
  const [selectionBox, setSelectionBox] =
    useState<NormalizedChartBounds | null>(null);
  const [intent, setIntent] =
    useState<SelectionAnnotation["intent"]>("context");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const sectionAnnotations = useMemo(
    () =>
      lens.selection.annotations.filter(
        (annotation) =>
          annotation.kind === "chart" && annotation.sectionId === sectionId,
      ),
    [lens.selection.annotations, sectionId],
  );
  const renderedAnnotations = useMemo(
    () =>
      sectionAnnotations.filter((annotation) =>
        sameFieldBinding(annotation, chartFieldIds),
      ),
    [chartFieldIds, sectionAnnotations],
  );

  const resetDraft = () => {
    cancelAnimationFrame(strokeFrameRef.current);
    strokeFrameRef.current = 0;
    strokeRef.current = [];
    setActiveStroke([]);
    setEditingId(null);
    setIntent("context");
    setSelectionBox(null);
    setStrokes([]);
    setText("");
  };

  const editAnnotation = (annotation: SelectionAnnotation) => {
    setOpen(true);
    setMode(annotation.strokes.length > 0 ? "draw" : "select");
    setEditingId(annotation.id);
    setIntent(annotation.intent);
    setStrokes(annotation.strokes);
    setText(annotation.text);
    lens.actions.selectObservations(annotation.observationIds, false);
  };

  const saveAnnotation = () => {
    const savedViews = getWorkspaceSavedViewsState(host);
    lens.actions.saveAnnotation({
      artifactId: null,
      artifactSha256: null,
      chartFieldIds: [...chartFieldIds],
      filters: lens.selection.filters.map((filter) => ({
        ...filter,
        values: [...filter.values],
      })),
      id: editingId ?? annotationID(),
      intent,
      kind: "chart",
      observationIds: [...lens.selection.selectedObservationIds],
      rangeId: null,
      sectionId,
      strokes,
      text,
      viewId:
        savedViews?.activeViewId ??
        lens.snapshot.experiment.presentation.initialViewId,
    });
    resetDraft();
    setOpen(false);
  };

  const flushActiveStroke = () => {
    cancelAnimationFrame(strokeFrameRef.current);
    strokeFrameRef.current = 0;
    const points = strokeRef.current;
    strokeRef.current = [];
    setActiveStroke([]);
    if (points.length >= 2) {
      setStrokes((current) => [
        ...current.slice(-(8 - 1)),
        { points: [...points] },
      ]);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const point = normalizedPoint(event);
    pointerIdRef.current = event.pointerId;
    startRef.current = point;
    additiveRef.current = event.shiftKey;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "draw") {
      strokeRef.current = [point];
      setActiveStroke([point]);
    } else {
      setSelectionBox(normalizedBounds(point, point));
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId || startRef.current === null) {
      return;
    }
    event.preventDefault();
    const point = normalizedPoint(event);
    if (mode === "select") {
      setSelectionBox(normalizedBounds(startRef.current, point));
      return;
    }
    const previous = strokeRef.current.at(-1);
    if (
      previous &&
      Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0025
    ) {
      return;
    }
    if (strokeRef.current.length < 1024) {
      strokeRef.current = [...strokeRef.current, point];
    }
    if (strokeFrameRef.current === 0) {
      strokeFrameRef.current = requestAnimationFrame(() => {
        strokeFrameRef.current = 0;
        setActiveStroke([...strokeRef.current]);
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId || startRef.current === null) {
      return;
    }
    event.preventDefault();
    const start = startRef.current;
    const end = normalizedPoint(event);
    pointerIdRef.current = null;
    startRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (mode === "draw") {
      const previous = strokeRef.current.at(-1);
      if (
        strokeRef.current.length < 1024 &&
        (!previous || Math.hypot(end.x - previous.x, end.y - previous.y) > 0)
      ) {
        strokeRef.current = [...strokeRef.current, end];
      }
      flushActiveStroke();
      return;
    }
    const chart = chartRef.current?.getChart();
    if (chart && selectionResolver) {
      const observationIds = selectionResolver(
        { additive: additiveRef.current, bounds: normalizedBounds(start, end) },
        chart,
      );
      lens.actions.selectObservations(observationIds, additiveRef.current);
    }
    setSelectionBox(null);
  };

  const interactive =
    open && (mode === "draw" || selectionResolver !== undefined);
  const canSave =
    text.trim() !== "" &&
    (strokes.length > 0 || lens.selection.selectedObservationIds.length > 0);

  return (
    <div
      className="lens-chart-annotation-shell"
      data-lens-annotation-section={sectionId}
    >
      <div className="lens-chart-annotation-toolbar">
        <button
          aria-expanded={open}
          onClick={() => {
            if (open) {
              resetDraft();
            }
            setOpen((current) => !current);
          }}
          type="button"
        >
          Annotate
          {sectionAnnotations.length > 0
            ? ` ${String(sectionAnnotations.length)}`
            : ""}
        </button>
        {open && selectionResolver ? (
          <button
            aria-pressed={mode === "select"}
            onClick={() => setMode("select")}
            type="button"
          >
            Select points
          </button>
        ) : null}
        {open ? (
          <button
            aria-pressed={mode === "draw"}
            onClick={() => setMode("draw")}
            type="button"
          >
            Draw
          </button>
        ) : null}
        {open && strokes.length > 0 ? (
          <button
            onClick={() => setStrokes((current) => current.slice(0, -1))}
            type="button"
          >
            Undo stroke
          </button>
        ) : null}
      </div>
      <div className="lens-chart-annotation-stage">
        <EChartSurface {...surfaceProps} ref={chartRef} />
        <AnnotationStrokes
          annotations={renderedAnnotations}
          draft={[
            ...strokes,
            ...(activeStroke.length >= 2 ? [{ points: activeStroke }] : []),
          ]}
        />
        {interactive ? (
          <svg
            aria-label={
              mode === "draw"
                ? "Draw chart annotation"
                : "Select chart observations"
            }
            className={`lens-chart-annotation-input lens-chart-annotation-input-${mode} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            preserveAspectRatio="none"
            role="application"
            viewBox="0 0 1 1"
          >
            {selectionBox ? (
              <rect
                className="lens-chart-selection-box"
                height={selectionBox.bottom - selectionBox.top}
                vectorEffect="non-scaling-stroke"
                width={selectionBox.right - selectionBox.left}
                x={selectionBox.left}
                y={selectionBox.top}
              />
            ) : null}
          </svg>
        ) : null}
      </div>
      {open ? (
        <div className="lens-chart-annotation-panel">
          <div className="lens-chart-annotation-composer">
            <select
              aria-label="Annotation intent"
              onChange={(event) =>
                setIntent(event.target.value as SelectionAnnotation["intent"])
              }
              value={intent}
            >
              <option value="context">Add context</option>
              <option value="question">Ask agent</option>
              <option value="follow-up">Request follow-up</option>
            </select>
            <textarea
              aria-label="Chart annotation text"
              onChange={(event) => setText(event.target.value)}
              placeholder="Explain what matters or request the next experiment"
              value={text}
            />
            <span>
              {lens.selection.selectedObservationIds.length} selected ·{" "}
              {strokes.length} {strokes.length === 1 ? "stroke" : "strokes"}
            </span>
            <button
              disabled={!canSave || lens.busy}
              onClick={saveAnnotation}
              type="button"
            >
              {editingId ? "Update annotation" : "Save annotation"}
            </button>
          </div>
          {sectionAnnotations.length > 0 ? (
            <ul
              aria-label="Saved chart annotations"
              className="lens-chart-annotation-list"
            >
              {sectionAnnotations.map((annotation) => (
                <li key={annotation.id}>
                  <div>
                    <strong>{annotationLabel(annotation)}</strong>
                    <span>
                      {annotation.observationIds.length} points ·{" "}
                      {annotation.strokes.length} strokes
                    </span>
                    <p>{annotation.text}</p>
                  </div>
                  <button
                    onClick={() => editAnnotation(annotation)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => lens.actions.deleteAnnotation(annotation.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
