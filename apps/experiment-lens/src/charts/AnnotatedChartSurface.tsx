import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  WorkspaceNormalizedStrokeSurface,
  useWorkspaceDocumentSnapshot,
  type WorkspaceNormalizedPoint,
  type WorkspaceNormalizedStroke,
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

function chartAnnotationCanSave(
  text: string,
  strokeCount: number,
  selectedCount: number,
): boolean {
  return text.trim() !== "" && (strokeCount > 0 || selectedCount > 0);
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

function ChartSelectionInput({
  active,
  selectionBox,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  active: boolean;
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
      aria-label="Select chart observations"
      className={`lens-chart-annotation-input lens-chart-annotation-input-select ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AnnotationMode>(() =>
    initialAnnotationMode(selectionResolver),
  );
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
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
  const renderedStrokes = useMemo<readonly WorkspaceNormalizedStroke[]>(
    () => [
      ...renderedAnnotations.flatMap((annotation) =>
        annotation.strokes.map((stroke, index) => ({
          className: `lens-chart-annotation-stroke lens-chart-annotation-stroke-${annotation.intent}`,
          id: `${annotation.id}:${String(index)}`,
          points: stroke.points,
        })),
      ),
      ...strokes.map((stroke, index) => ({
        className:
          "lens-chart-annotation-stroke lens-chart-annotation-stroke-draft",
        id: `draft:${String(index)}`,
        points: stroke.points,
      })),
    ],
    [renderedAnnotations, strokes],
  );

  const resetDraft = () => {
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

  const handleSelectionPointerDown = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const point = normalizedPoint(event);
    pointerIdRef.current = event.pointerId;
    startRef.current = point;
    additiveRef.current = event.shiftKey;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectionBox(normalizedBounds(point, point));
  };

  const handleSelectionPointerMove = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (pointerIdRef.current !== event.pointerId || startRef.current === null) {
      return;
    }
    event.preventDefault();
    const point = normalizedPoint(event);
    setSelectionBox(normalizedBounds(startRef.current, point));
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

  const handleSelectionPointerUp = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (pointerIdRef.current !== event.pointerId || startRef.current === null) {
      return;
    }
    event.preventDefault();
    const start = startRef.current;
    const end = normalizedPoint(event);
    pointerIdRef.current = null;
    startRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishSelection(start, end);
  };

  const selectedCount = lens.selection.selectedObservationIds.length;
  const supportsSelection = selectionResolver !== undefined;
  const drawing = open && mode === "draw";
  const selecting = open && mode === "select" && supportsSelection;
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
        <WorkspaceNormalizedStrokeSurface
          ariaLabel="Draw chart annotation"
          className={
            drawing
              ? "lens-chart-annotation-overlay lens-chart-annotation-input lens-chart-annotation-input-draw"
              : "lens-chart-annotation-overlay"
          }
          draftClassName="lens-chart-annotation-stroke lens-chart-annotation-stroke-draft"
          enabled={drawing}
          onStrokeComplete={(points: readonly WorkspaceNormalizedPoint[]) =>
            setStrokes((current) => [
              ...current.slice(-(8 - 1)),
              { points: points.map((point) => ({ ...point })) },
            ])
          }
          resetKey={`${activeViewId}:${sectionId}`}
          strokes={renderedStrokes}
        />
        <ChartSelectionInput
          active={selecting}
          onPointerDown={handleSelectionPointerDown}
          onPointerMove={handleSelectionPointerMove}
          onPointerUp={handleSelectionPointerUp}
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
