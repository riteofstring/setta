import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  useWorkspaceDocumentSnapshot,
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
import type { ChartSelectionGesture } from "./chartSelection";

type AnnotationMode = "draw" | "select";

type NormalizedChartBounds = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

type ChartSelectionResolver = (
  gesture: ChartSelectionGesture,
  chart: LensChart,
) => readonly string[];

type AnnotatedChartSurfaceProps = EChartSurfaceProps &
  Readonly<{
    chartFieldIds: readonly string[];
    sectionId: string;
    selectionLabel?: string;
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

function initialAnnotationMode(
  selectionResolver: ChartSelectionResolver | undefined,
): AnnotationMode {
  return selectionResolver ? "select" : "draw";
}

function activeView(
  workspaceViewId: string | undefined,
  initialViewId: string,
): string {
  return workspaceViewId ?? initialViewId;
}

function chartInputActive(
  open: boolean,
  mode: AnnotationMode,
  supportsSelection: boolean,
): boolean {
  return open && (mode === "draw" || supportsSelection);
}

function chartAnnotationCanSave(
  text: string,
  strokeCount: number,
  selectedCount: number,
): boolean {
  return text.trim() !== "" && (strokeCount > 0 || selectedCount > 0);
}

function chartDraftStrokes(
  strokes: readonly AnnotationStroke[],
  activeStroke: readonly AnnotationPoint[],
): AnnotationStroke[] {
  return activeStroke.length >= 2
    ? [...strokes, { points: [...activeStroke] }]
    : [...strokes];
}

function annotationControlLabel(annotationCount: number): string {
  return annotationCount > 0
    ? `Annotate ${String(annotationCount)}`
    : "Annotate";
}

function SelectionModeButton({
  label,
  mode,
  open,
  supportsSelection,
  onSelect,
}: {
  label: string;
  mode: AnnotationMode;
  open: boolean;
  supportsSelection: boolean;
  onSelect: () => void;
}) {
  if (!open || !supportsSelection) {
    return null;
  }
  return (
    <button aria-pressed={mode === "select"} onClick={onSelect} type="button">
      {label}
    </button>
  );
}

function DrawModeButton({
  mode,
  open,
  onDraw,
}: {
  mode: AnnotationMode;
  open: boolean;
  onDraw: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <button aria-pressed={mode === "draw"} onClick={onDraw} type="button">
      Draw
    </button>
  );
}

function UndoStrokeButton({
  open,
  strokeCount,
  onUndo,
}: {
  open: boolean;
  strokeCount: number;
  onUndo: () => void;
}) {
  if (!open || strokeCount === 0) {
    return null;
  }
  return (
    <button onClick={onUndo} type="button">
      Undo stroke
    </button>
  );
}

function AnnotationToolbar({
  annotationCount,
  mode,
  open,
  strokeCount,
  supportsSelection,
  onDraw,
  onSelect,
  onToggle,
  onUndo,
  selectionLabel,
}: {
  annotationCount: number;
  mode: AnnotationMode;
  open: boolean;
  strokeCount: number;
  supportsSelection: boolean;
  onDraw: () => void;
  onSelect: () => void;
  onToggle: () => void;
  onUndo: () => void;
  selectionLabel: string;
}) {
  return (
    <div className="lens-chart-annotation-toolbar">
      <button aria-expanded={open} onClick={onToggle} type="button">
        {annotationControlLabel(annotationCount)}
      </button>
      <SelectionModeButton
        label={selectionLabel}
        mode={mode}
        onSelect={onSelect}
        open={open}
        supportsSelection={supportsSelection}
      />
      <DrawModeButton mode={mode} onDraw={onDraw} open={open} />
      <UndoStrokeButton onUndo={onUndo} open={open} strokeCount={strokeCount} />
    </div>
  );
}

function ChartAnnotationInput({
  active,
  mode,
  selectionBox,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  active: boolean;
  mode: AnnotationMode;
  selectionBox: NormalizedChartBounds | null;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
}) {
  if (!active) {
    return null;
  }
  return (
    <svg
      aria-label={
        mode === "draw" ? "Draw chart annotation" : "Select chart observations"
      }
      className={`lens-chart-annotation-input lens-chart-annotation-input-${mode} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
  );
}

function SavedAnnotationList({
  annotations,
  onDelete,
  onEdit,
}: {
  annotations: readonly SelectionAnnotation[];
  onDelete: (annotationId: string) => void;
  onEdit: (annotation: SelectionAnnotation) => void;
}) {
  if (annotations.length === 0) {
    return null;
  }
  return (
    <ul
      aria-label="Saved chart annotations"
      className="lens-chart-annotation-list"
    >
      {annotations.map((annotation) => (
        <li key={annotation.id}>
          <div>
            <strong>{annotationLabel(annotation)}</strong>
            <span>
              {annotation.observationIds.length} points ·{" "}
              {annotation.strokes.length} strokes
            </span>
            <p>{annotation.text}</p>
          </div>
          <button onClick={() => onEdit(annotation)} type="button">
            Edit
          </button>
          <button onClick={() => onDelete(annotation.id)} type="button">
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChartAnnotationPanel({
  annotations,
  busy,
  canSave,
  editingId,
  intent,
  open,
  selectedCount,
  strokeCount,
  text,
  onDelete,
  onEdit,
  onIntentChange,
  onSave,
  onTextChange,
}: {
  annotations: readonly SelectionAnnotation[];
  busy: boolean;
  canSave: boolean;
  editingId: string | null;
  intent: SelectionAnnotation["intent"];
  open: boolean;
  selectedCount: number;
  strokeCount: number;
  text: string;
  onDelete: (annotationId: string) => void;
  onEdit: (annotation: SelectionAnnotation) => void;
  onIntentChange: (intent: SelectionAnnotation["intent"]) => void;
  onSave: () => void;
  onTextChange: (text: string) => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="lens-chart-annotation-panel">
      <div className="lens-chart-annotation-composer">
        <select
          aria-label="Annotation intent"
          onChange={(event) =>
            onIntentChange(event.target.value as SelectionAnnotation["intent"])
          }
          value={intent}
        >
          <option value="context">Add context</option>
          <option value="question">Ask agent</option>
          <option value="follow-up">Request follow-up</option>
        </select>
        <textarea
          aria-label="Chart annotation text"
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Explain what matters or request the next experiment"
          value={text}
        />
        <span>
          {selectedCount} selected · {strokeCount}{" "}
          {strokeCount === 1 ? "stroke" : "strokes"}
        </span>
        <button disabled={!canSave || busy} onClick={onSave} type="button">
          {editingId ? "Update annotation" : "Save annotation"}
        </button>
      </div>
      <SavedAnnotationList
        annotations={annotations}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    </div>
  );
}

export function AnnotatedChartSurface({
  chartFieldIds,
  sectionId,
  selectionLabel = "Select data",
  selectionResolver,
  ...surfaceProps
}: AnnotatedChartSurfaceProps) {
  const lens = useLens();
  const workspace = useWorkspaceDocumentSnapshot();
  const activeViewId = activeView(
    workspace.savedViews?.activeViewId,
    lens.snapshot.experiment.presentation.initialViewId,
  );
  const chartRef = useRef<EChartSurfaceHandle | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<AnnotationPoint | null>(null);
  const additiveRef = useRef(false);
  const strokeRef = useRef<AnnotationPoint[]>([]);
  const strokeFrameRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AnnotationMode>(() =>
    initialAnnotationMode(selectionResolver),
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
          annotation.kind === "chart" &&
          annotation.sectionId === sectionId &&
          annotation.viewId === activeViewId,
      ),
    [activeViewId, lens.selection.annotations, sectionId],
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
    lens.actions.replaceSelectedObservations(annotation.observationIds);
  };

  const saveAnnotation = () => {
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
      viewId: activeViewId,
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

  const finishActiveStroke = (end: AnnotationPoint) => {
    const previous = strokeRef.current.at(-1);
    if (
      strokeRef.current.length < 1024 &&
      (!previous || Math.hypot(end.x - previous.x, end.y - previous.y) > 0)
    ) {
      strokeRef.current = [...strokeRef.current, end];
    }
    flushActiveStroke();
  };

  const finishSelection = (start: AnnotationPoint, end: AnnotationPoint) => {
    const chart = chartRef.current?.getChart();
    if (chart && selectionResolver) {
      const observationIds = selectionResolver(
        { additive: additiveRef.current, bounds: normalizedBounds(start, end) },
        chart,
      );
      lens.actions.selectObservationGroup(observationIds, additiveRef.current);
    }
    setSelectionBox(null);
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
      finishActiveStroke(end);
      return;
    }
    finishSelection(start, end);
  };

  const selectedCount = lens.selection.selectedObservationIds.length;
  const supportsSelection = selectionResolver !== undefined;
  const interactive = chartInputActive(open, mode, supportsSelection);
  const canSave = chartAnnotationCanSave(text, strokes.length, selectedCount);
  const toggleOpen = () => {
    if (open) {
      resetDraft();
    }
    setOpen((current) => !current);
  };

  return (
    <div
      className="lens-chart-annotation-shell"
      data-lens-annotation-section={sectionId}
    >
      <AnnotationToolbar
        annotationCount={sectionAnnotations.length}
        mode={mode}
        onDraw={() => setMode("draw")}
        onSelect={() => setMode("select")}
        onToggle={toggleOpen}
        onUndo={() => setStrokes((current) => current.slice(0, -1))}
        open={open}
        selectionLabel={selectionLabel}
        strokeCount={strokes.length}
        supportsSelection={supportsSelection}
      />
      <div className="lens-chart-annotation-stage">
        <EChartSurface {...surfaceProps} ref={chartRef} />
        <AnnotationStrokes
          annotations={renderedAnnotations}
          draft={chartDraftStrokes(strokes, activeStroke)}
        />
        <ChartAnnotationInput
          active={interactive}
          mode={mode}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          selectionBox={selectionBox}
        />
      </div>
      <ChartAnnotationPanel
        annotations={sectionAnnotations}
        busy={lens.busy}
        canSave={canSave}
        editingId={editingId}
        intent={intent}
        onDelete={lens.actions.deleteAnnotation}
        onEdit={editAnnotation}
        onIntentChange={setIntent}
        onSave={saveAnnotation}
        onTextChange={setText}
        open={open}
        selectedCount={selectedCount}
        strokeCount={strokes.length}
        text={text}
      />
    </div>
  );
}
