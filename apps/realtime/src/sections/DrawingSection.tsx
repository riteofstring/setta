import { useEffect, useMemo, useRef, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  setWorkspaceSectionSize,
  type WorkspaceSection,
  type WorkspaceSectionData,
  useWorkspaceHost,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import {
  resolveRuntimeValue,
  runtimeCanInvoke,
  runtimeValueKey,
  type RuntimeViewState,
} from "../app/runtimeState";
import type { Binding, Project } from "../backend/generatedContract";
import {
  RealtimeDrawingRuntime,
  type DrawingHistoryState,
  type DrawingSelectionSnapshot,
  type DrawingTool,
} from "./drawingRuntime";
import {
  resolveDrawingKeyboardAction,
  type DrawingKeyboardAction,
} from "./drawingKeyboard";
import { DRAWING_GRID_DEFAULT_SPACING } from "./drawingGrid";
import { DrawingSceneAuthority } from "./drawingSceneAuthority";
import {
  DrawingSettlementQueue,
  type DrawingSnapshot,
} from "./drawingSettlementQueue";
import {
  EMPTY_DRAWING_SELECTION_SNAPSHOT,
  registerDrawingSurface,
} from "./drawingSurfaceRegistry";
import { DrawingToolbarIcon } from "./DrawingToolbarIcon";
import type { DrawingViewportPresentation } from "./drawingViewport";
import { DrawingViewportController } from "./drawingViewportController";
import { readDrawingSectionData } from "./sectionData";

const SETTLE_DELAY_MILLISECONDS = 180;
const PREVIEW_DELAY_MILLISECONDS = 90;
const INITIAL_HISTORY_STATE: DrawingHistoryState = {
  canRedo: false,
  canUndo: false,
};
const DRAWING_TOOL_LABELS: Record<DrawingTool, string> = {
  draw: "Draw",
  erase: "Eraser",
  hand: "Hand",
  highlighter: "Highlighter",
  select: "Select",
};
type DrawingBrushSettings = {
  color: string;
  width: number;
};
type DrawingPanGesture = {
  pointerId: number;
  x: number;
  y: number;
};
type DrawingBrushPresentation = {
  disabled: boolean;
  label: "Highlighter" | "Pen";
  maxWidth: number;
  settings: DrawingBrushSettings;
};
type DrawingViewportToolbarPresentation = {
  actualSizePressed: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  fitPressed: boolean;
  unavailable: boolean;
  zoomLabel: string;
};
type DrawingKeyboardSimpleAction = Exclude<
  DrawingKeyboardAction,
  { type: "nudge-selection" } | { type: "select-all" } | { type: "set-tool" }
>;

const INITIAL_PEN: DrawingBrushSettings = {
  color: "#111827",
  width: 4,
};
const INITIAL_HIGHLIGHTER: DrawingBrushSettings = {
  color: "#facc15",
  width: 18,
};
const TERMINAL_INVOCATION_STATES = new Set([
  "cancelled",
  "completed",
  "crashed",
  "failed",
  "superseded",
  "timedOut",
]);

const DRAWING_KEYBOARD_COMMAND_BY_TYPE: Record<
  DrawingKeyboardSimpleAction["type"],
  (drawing: RealtimeDrawingRuntime) => void
> = {
  "clear-selection": (drawing) => void drawing.clearSelection(),
  "copy-selection": (drawing) => void drawing.copySelection(),
  "delete-selection": (drawing) => void drawing.deleteSelection(),
  "duplicate-selection": (drawing) => void drawing.duplicateSelection(),
  "group-selection": (drawing) => void drawing.groupSelection(),
  paste: (drawing) => void drawing.pasteSelection(),
  redo: (drawing) => void drawing.redo(),
  undo: (drawing) => void drawing.undo(),
  "ungroup-selection": (drawing) => void drawing.ungroupSelection(),
};

function drawingBrushPresentation(
  tool: DrawingTool,
  pen: DrawingBrushSettings,
  highlighter: DrawingBrushSettings,
): DrawingBrushPresentation {
  if (tool === "highlighter") {
    return {
      disabled: false,
      label: "Highlighter",
      maxWidth: 64,
      settings: highlighter,
    };
  }
  return {
    disabled: tool !== "draw",
    label: "Pen",
    maxWidth: 32,
    settings: pen,
  };
}

function drawingViewportToolbarPresentation(
  viewport: DrawingViewportPresentation | null,
): DrawingViewportToolbarPresentation {
  if (viewport === null) {
    return {
      actualSizePressed: false,
      canZoomIn: false,
      canZoomOut: false,
      fitPressed: false,
      unavailable: true,
      zoomLabel: "–",
    };
  }
  return {
    actualSizePressed: viewport.mode === "custom" && viewport.scale === 1,
    canZoomIn: viewport.canZoomIn,
    canZoomOut: viewport.canZoomOut,
    fitPressed: viewport.mode === "fit",
    unavailable: false,
    zoomLabel: `${Math.round(viewport.zoomPercent)}%`,
  };
}

function runDrawingKeyboardAction(
  drawing: RealtimeDrawingRuntime,
  action: DrawingKeyboardAction,
  setTool: (tool: DrawingTool) => void,
): void {
  if (action.type === "set-tool") {
    setTool(action.tool);
    drawing.setTool(action.tool);
    return;
  }
  if (action.type === "nudge-selection") {
    drawing.nudgeSelection(action.x, action.y);
    return;
  }
  if (action.type === "select-all") {
    drawing.selectAll();
    setTool("select");
    return;
  }
  DRAWING_KEYBOARD_COMMAND_BY_TYPE[action.type](drawing);
}

function snapshotBindings(project: Project, sectionId: string): Binding[] {
  return project.bindings.filter(
    (binding) =>
      binding.trigger.sectionId === sectionId &&
      binding.trigger.event === "snapshot",
  );
}

function isCompletionPaced(project: Project, sectionId: string): boolean {
  const bindings = snapshotBindings(project, sectionId);
  return (
    bindings.length > 0 &&
    bindings.every(
      (binding) =>
        binding.scheduling.mode === "latest" &&
        binding.scheduling.debounceMilliseconds === 0,
    )
  );
}

function canEmitSnapshot(
  project: Project,
  runtime: RuntimeViewState,
  sectionId: string,
): boolean {
  if (!runtimeCanInvoke(runtime)) {
    return false;
  }
  if (!isCompletionPaced(project, sectionId)) {
    return true;
  }
  return snapshotBindings(project, sectionId).every((binding) => {
    const invocation = runtime.invocations[binding.id];
    return (
      invocation === undefined ||
      TERMINAL_INVOCATION_STATES.has(invocation.state)
    );
  });
}

function snapshotCapacityKey(
  project: Project,
  runtime: RuntimeViewState,
  sectionId: string,
): string {
  return JSON.stringify({
    bindings: snapshotBindings(project, sectionId).map((binding) => ({
      debounceMilliseconds: binding.scheduling.debounceMilliseconds,
      id: binding.id,
      invocation: runtime.invocations[binding.id] ?? null,
      mode: binding.scheduling.mode,
    })),
    connection: runtime.connection,
    sessionId: runtime.sessionId,
    workerState: runtime.workerState,
  });
}

type DrawingAuthorityDocument = WorkspaceSectionData & {
  background: string;
  height: number;
  scene: WorkspaceSectionData;
  width: number;
};

function drawingAuthorityValue(
  background: string,
  snapshot: Pick<DrawingSnapshot, "height" | "scene" | "width">,
): DrawingAuthorityDocument {
  return {
    background,
    height: snapshot.height,
    scene: snapshot.scene,
    width: snapshot.width,
  } as DrawingAuthorityDocument;
}

function measureDrawingToolbarHeight(
  stage: HTMLDivElement,
  width: number,
): number {
  const drawing = stage.parentElement;
  const toolbar = stage.previousElementSibling;
  if (
    !(drawing instanceof HTMLElement) ||
    !(toolbar instanceof HTMLElement) ||
    !toolbar.classList.contains("realtime-drawing-toolbar")
  ) {
    return 0;
  }
  const measurement = drawing.cloneNode(false) as HTMLElement;
  const measuredToolbar = toolbar.cloneNode(true) as HTMLElement;
  measurement.ariaHidden = "true";
  measurement.style.position = "fixed";
  measurement.style.top = "0";
  measurement.style.left = "-10000px";
  measurement.style.width = `${width}px`;
  measurement.style.height = "auto";
  measurement.style.minHeight = "0";
  measurement.style.visibility = "hidden";
  measurement.append(measuredToolbar);
  document.body.append(measurement);
  const height = measuredToolbar.offsetHeight;
  measurement.remove();
  return height;
}

function usesMacOSShortcuts(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function DrawingSection({ section }: { section: WorkspaceSection }) {
  const host = useWorkspaceHost();
  const { actions, project, runtime } = useRealtime();
  const data = readDrawingSectionData(section.data);
  const { background, height, width } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<RealtimeDrawingRuntime | null>(null);
  const viewportRef = useRef<DrawingViewportController | null>(null);
  const panGestureRef = useRef<DrawingPanGesture | null>(null);
  const sceneAuthorityRef = useRef<DrawingSceneAuthority | null>(null);
  const settlementRef = useRef<DrawingSettlementQueue | null>(null);
  const [history, setHistory] = useState(INITIAL_HISTORY_STATE);
  const [highlighter, setHighlighter] =
    useState<DrawingBrushSettings>(INITIAL_HIGHLIGHTER);
  const [pen, setPen] = useState<DrawingBrushSettings>(INITIAL_PEN);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [gridVisible, setGridVisible] = useState(false);
  const [selection, setSelection] = useState<DrawingSelectionSnapshot>(
    EMPTY_DRAWING_SELECTION_SNAPSHOT,
  );
  const [tool, setTool] = useState<DrawingTool>("draw");
  const [viewport, setViewport] = useState<DrawingViewportPresentation | null>(
    null,
  );
  const gridSnapEnabledRef = useRef(gridSnapEnabled);
  const gridVisibleRef = useRef(gridVisible);
  const scene = resolveRuntimeValue(
    runtime.values,
    runtimeValueKey(section.id, "scene"),
    data.scene,
  ) as WorkspaceSectionData;
  const drawingDocument = useMemo(
    () => drawingAuthorityValue(background, { height, scene, width }),
    [background, height, scene, width],
  );
  const drawingDocumentRef = useRef(drawingDocument);
  const projectRef = useRef(project);
  const runtimeRef = useRef(runtime);
  const snapshotCanEmit = canEmitSnapshot(project, runtime, section.id);
  const capacityKey = snapshotCapacityKey(project, runtime, section.id);
  drawingDocumentRef.current = drawingDocument;
  projectRef.current = project;
  runtimeRef.current = runtime;
  gridSnapEnabledRef.current = gridSnapEnabled;
  gridVisibleRef.current = gridVisible;

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) {
      return;
    }
    const initialDocument = drawingDocumentRef.current;
    const sceneAuthority = new DrawingSceneAuthority(initialDocument);
    let settlement: DrawingSettlementQueue | null = null;
    const drawing = new RealtimeDrawingRuntime(element, {
      background,
      height: initialDocument.height,
      onHistoryChange: setHistory,
      onPreview: () => {
        sceneAuthority.localChange();
        settlement?.preview();
      },
      onSettled: () => {
        sceneAuthority.localChange();
        settlement?.settle();
      },
      width: initialDocument.width,
    });
    const updateSelection = () => {
      setSelection(drawing.getSelectionSnapshot());
    };
    const unsubscribeSelection = drawing.subscribeSelection(updateSelection);
    updateSelection();
    const stage = stageRef.current;
    if (stage === null) {
      void drawing.dispose();
      return;
    }
    const drawingViewport = new DrawingViewportController(
      drawing.canvas,
      drawing.getLogicalSize(),
      { height: stage.clientHeight, width: stage.clientWidth },
      setViewport,
    );
    drawingViewport.setGrid({
      spacing: DRAWING_GRID_DEFAULT_SPACING,
      visible: gridVisibleRef.current,
    });
    drawing.setGridSnap(
      gridSnapEnabledRef.current ? DRAWING_GRID_DEFAULT_SPACING : null,
    );
    const preventSectionActivation = (event: MouseEvent) => {
      event.stopPropagation();
    };
    stage.addEventListener("click", preventSectionActivation);
    const resizeObserver = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (bounds !== undefined) {
        drawingViewport.resizeStage({
          height: bounds.height,
          width: bounds.width,
        });
      }
    });
    resizeObserver.observe(stage);
    settlement = new DrawingSettlementQueue({
      canEmit: () =>
        canEmitSnapshot(projectRef.current, runtimeRef.current, section.id),
      capture: () => drawing.captureSnapshot(),
      capturePreview: () => drawing.capturePreview(),
      commit: async (snapshot) => {
        const nextDocument = drawingAuthorityValue(background, snapshot);
        const pending = sceneAuthority.prepareCommit(nextDocument);
        const committed = await actions.commitSectionData(
          section.id,
          nextDocument,
        );
        if (committed) {
          sceneAuthority.acknowledge(
            pending,
            drawingAuthorityValue(background, {
              ...drawing.getLogicalSize(),
              scene: drawing.toScene(),
            }),
          );
        }
        return committed;
      },
      delayMilliseconds: SETTLE_DELAY_MILLISECONDS,
      emit: (reference) => {
        return actions.emit(section.id, "snapshot", {
          contentRef: reference,
        });
      },
      isCompletionPaced: () =>
        isCompletionPaced(projectRef.current, section.id),
      onError: (error) => {
        actions.reportError(
          error instanceof Error
            ? error.message
            : "Realtime could not settle the drawing.",
        );
      },
      previewDelayMilliseconds: PREVIEW_DELAY_MILLISECONDS,
      upload: actions.uploadContent,
    });
    sceneAuthorityRef.current = sceneAuthority;
    settlementRef.current = settlement;
    drawingRef.current = drawing;
    viewportRef.current = drawingViewport;
    const unregisterDrawingSurface = registerDrawingSurface(host, section.id, {
      alignSelection: (alignment) => drawing.alignSelection(alignment),
      bringSelectionForward: () => drawing.bringSelectionForward(),
      bringSelectionToFront: () => drawing.bringSelectionToFront(),
      clearSelection: () => drawing.clearSelection(),
      copySelection: () => drawing.copySelection(),
      deleteSelection: () => drawing.deleteSelection(),
      distributeSelection: (distribution) =>
        drawing.distributeSelection(distribution),
      duplicateSelection: () => drawing.duplicateSelection(),
      fitSectionToCanvas: () => {
        const frame = stage.closest<HTMLElement>("section");
        if (frame === null) {
          return false;
        }
        const size = drawing.getLogicalSize();
        const toolbar = stage.previousElementSibling;
        const currentToolbarHeight =
          toolbar instanceof HTMLElement ? toolbar.offsetHeight : 0;
        const targetToolbarHeight = measureDrawingToolbarHeight(
          stage,
          size.width,
        );
        setWorkspaceSectionSize(host, section.id, {
          height:
            size.height +
            frame.offsetHeight -
            stage.clientHeight -
            currentToolbarHeight +
            targetToolbarHeight,
          width: size.width + frame.offsetWidth - stage.clientWidth,
        });
        return true;
      },
      getCanvasSize: () => drawing.getLogicalSize(),
      getSelectionSnapshot: () => drawing.getSelectionSnapshot(),
      groupSelection: () => drawing.groupSelection(),
      nudgeSelection: (x, y) => drawing.nudgeSelection(x, y),
      pasteSelection: () => drawing.pasteSelection(),
      resizeCanvas: (request) => {
        const resized = drawing.resizeCanvas(request);
        if (resized) {
          drawingViewport.resizeLogical(drawing.getLogicalSize());
        }
        return resized;
      },
      selectAll: () => drawing.selectAll(),
      sendSelectionBackward: () => drawing.sendSelectionBackward(),
      sendSelectionToBack: () => drawing.sendSelectionToBack(),
      setSelectionAppearance: (patch) => drawing.setSelectionAppearance(patch),
      setSelectionTypography: (patch) => drawing.setSelectionTypography(patch),
      subscribeSelection: (listener) => drawing.subscribeSelection(listener),
      toggleSelectionLock: () => drawing.toggleSelectionLock(),
      ungroupSelection: () => drawing.ungroupSelection(),
    });
    void drawing
      .loadScene(initialDocument.scene)
      .then((loaded) => {
        if (loaded) {
          sceneAuthority.loaded(initialDocument);
        }
      })
      .catch((error: unknown) => {
        actions.reportError(
          error instanceof Error
            ? error.message
            : "Realtime could not load the drawing scene.",
        );
      });
    return () => {
      stage.removeEventListener("click", preventSectionActivation);
      resizeObserver.disconnect();
      unsubscribeSelection();
      unregisterDrawingSurface();
      drawingViewport.dispose();
      settlement?.dispose();
      if (settlementRef.current === settlement) {
        settlementRef.current = null;
      }
      if (sceneAuthorityRef.current === sceneAuthority) {
        sceneAuthorityRef.current = null;
      }
      if (viewportRef.current === drawingViewport) {
        viewportRef.current = null;
      }
      drawingRef.current = null;
      void drawing.dispose();
    };
  }, [actions, background, host, section.id]);

  useEffect(() => {
    if (snapshotCanEmit) {
      settlementRef.current?.resume();
    }
  }, [capacityKey, snapshotCanEmit]);

  useEffect(() => {
    const drawing = drawingRef.current;
    const sceneAuthority = sceneAuthorityRef.current;
    if (
      drawing !== null &&
      sceneAuthority !== null &&
      sceneAuthority.shouldLoad(drawingDocument)
    ) {
      void drawing
        .loadDocument({ height, scene, width })
        .then((loaded) => {
          if (loaded) {
            sceneAuthority.loaded(drawingDocument);
            viewportRef.current?.resizeLogical({ height, width });
          }
        })
        .catch((error: unknown) => {
          actions.reportError(
            error instanceof Error
              ? error.message
              : "Realtime could not load the drawing scene.",
          );
        });
    }
  }, [actions, drawingDocument, height, scene, width]);

  const chooseTool = (nextTool: DrawingTool) => {
    setTool(nextTool);
    drawingRef.current?.setTool(nextTool);
  };

  const changeBrushColor = (nextColor: string) => {
    const current = tool === "highlighter" ? highlighter : pen;
    const next = { ...current, color: nextColor };
    if (tool === "highlighter") {
      setHighlighter(next);
    } else {
      setPen(next);
    }
    drawingRef.current?.setBrush(next.color, next.width);
  };

  const changeBrushWidth = (nextWidth: number) => {
    const current = tool === "highlighter" ? highlighter : pen;
    const next = { ...current, width: nextWidth };
    if (tool === "highlighter") {
      setHighlighter(next);
    } else {
      setPen(next);
    }
    drawingRef.current?.setBrush(next.color, next.width);
  };

  const addDrawingObject = (
    add: (drawing: RealtimeDrawingRuntime) => unknown,
  ) => {
    const drawing = drawingRef.current;
    if (drawing === null) {
      return;
    }
    add(drawing);
    setTool("select");
  };

  const handleDrawingKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const drawing = drawingRef.current;
    if (drawing === null) {
      return;
    }
    const activeObject = drawing.canvas.getActiveObject() as
      { isEditing?: boolean } | undefined;
    const action = resolveDrawingKeyboardAction(event.nativeEvent, {
      availability: {
        activeTool: tool,
        canClearSelection: selection.canClearSelection,
        canCopySelection: selection.canCopy,
        canDeleteSelection: selection.canDelete,
        canDuplicateSelection: selection.canDuplicate,
        canGroupSelection: selection.canGroup,
        canNudgeSelection: selection.canDelete,
        canPaste: selection.canPaste,
        canRedo: history.canRedo,
        canSelectAll: selection.canSelectAll,
        canSetTool: true,
        canUndo: history.canUndo,
        canUngroupSelection: selection.canUngroup,
      },
      fabricTextEditing: activeObject?.isEditing === true,
      macOS: usesMacOSShortcuts(),
    });
    if (action === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    runDrawingKeyboardAction(drawing, action, setTool);
  };

  const toggleGrid = () => {
    const next = !gridVisible;
    gridVisibleRef.current = next;
    setGridVisible(next);
    viewportRef.current?.setGrid({
      spacing: DRAWING_GRID_DEFAULT_SPACING,
      visible: next,
    });
  };

  const toggleGridSnap = () => {
    const next = !gridSnapEnabled;
    gridSnapEnabledRef.current = next;
    setGridSnapEnabled(next);
    drawingRef.current?.setGridSnap(next ? DRAWING_GRID_DEFAULT_SPACING : null);
  };

  const handleStagePointerDownCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.currentTarget.focus({ preventScroll: true });
    if (tool !== "hand" || event.button !== 0) {
      return;
    }
    panGestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current?.canvas.setCursor("grabbing");
    event.preventDefault();
    event.stopPropagation();
  };

  const handleStagePointerMoveCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const gesture = panGestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    viewportRef.current?.panBy({
      x: event.clientX - gesture.x,
      y: event.clientY - gesture.y,
    });
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    event.preventDefault();
    event.stopPropagation();
  };

  const endHandPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    panGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current?.setTool("hand");
    event.preventDefault();
    event.stopPropagation();
  };

  const brushPresentation = drawingBrushPresentation(tool, pen, highlighter);
  const viewportPresentation = drawingViewportToolbarPresentation(viewport);

  return (
    <div className="realtime-drawing">
      <div
        aria-label="Drawing tools"
        className="realtime-drawing-toolbar"
        role="toolbar"
      >
        <div className="realtime-drawing-tool-group">
          {(["select", "draw", "highlighter", "erase", "hand"] as const).map(
            (candidate) => (
              <button
                aria-label={DRAWING_TOOL_LABELS[candidate]}
                aria-pressed={tool === candidate}
                className={`realtime-drawing-tool-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
                key={candidate}
                onClick={() => chooseTool(candidate)}
                title={DRAWING_TOOL_LABELS[candidate]}
                type="button"
              >
                <DrawingToolbarIcon name={candidate} />
              </button>
            ),
          )}
        </div>
        <div className="realtime-drawing-tool-group realtime-drawing-brush-controls">
          <label
            aria-label={`${brushPresentation.label} color`}
            title={`${brushPresentation.label} color`}
          >
            <input
              className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
              disabled={brushPresentation.disabled}
              onChange={(event) => changeBrushColor(event.currentTarget.value)}
              type="color"
              value={brushPresentation.settings.color}
            />
          </label>
          <label
            className="realtime-drawing-size"
            title={`${brushPresentation.label} size`}
          >
            <span className="realtime-drawing-size-label">Size</span>
            <input
              aria-label={`${brushPresentation.label} size`}
              className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
              disabled={brushPresentation.disabled}
              max={brushPresentation.maxWidth}
              min={1}
              onChange={(event) =>
                changeBrushWidth(Number(event.currentTarget.value))
              }
              type="range"
              value={brushPresentation.settings.width}
            />
            <output>{brushPresentation.settings.width}px</output>
          </label>
        </div>
        <div className="realtime-drawing-tool-group">
          <button
            aria-label="Add text"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => addDrawingObject((drawing) => drawing.addText())}
            title="Add text"
            type="button"
          >
            <DrawingToolbarIcon name="text" />
          </button>
          <button
            aria-label="Add line"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => addDrawingObject((drawing) => drawing.addLine())}
            title="Add line"
            type="button"
          >
            <DrawingToolbarIcon name="line" />
          </button>
          <button
            aria-label="Add arrow"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => addDrawingObject((drawing) => drawing.addArrow())}
            title="Add arrow"
            type="button"
          >
            <DrawingToolbarIcon name="arrow" />
          </button>
          <button
            aria-label="Add rectangle"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() =>
              addDrawingObject((drawing) => drawing.addRectangle())
            }
            title="Add rectangle"
            type="button"
          >
            <DrawingToolbarIcon name="rectangle" />
          </button>
          <button
            aria-label="Add ellipse"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => addDrawingObject((drawing) => drawing.addEllipse())}
            title="Add ellipse"
            type="button"
          >
            <DrawingToolbarIcon name="ellipse" />
          </button>
        </div>
        <div className="realtime-drawing-tool-group">
          <button
            aria-label="Undo"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={!history.canUndo}
            onClick={() => void drawingRef.current?.undo()}
            title="Undo"
            type="button"
          >
            <DrawingToolbarIcon name="undo" />
          </button>
          <button
            aria-label="Redo"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={!history.canRedo}
            onClick={() => void drawingRef.current?.redo()}
            title="Redo"
            type="button"
          >
            <DrawingToolbarIcon name="redo" />
          </button>
        </div>
        <div className="realtime-drawing-tool-group realtime-drawing-viewport-controls">
          <button
            aria-label="Zoom out"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={!viewportPresentation.canZoomOut}
            onClick={() => viewportRef.current?.zoomOut()}
            title="Zoom out"
            type="button"
          >
            <DrawingToolbarIcon name="zoom-out" />
          </button>
          <button
            aria-label="Fit canvas"
            aria-pressed={viewportPresentation.fitPressed}
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={viewportPresentation.unavailable}
            onClick={() => viewportRef.current?.fit()}
            title="Fit canvas"
            type="button"
          >
            <DrawingToolbarIcon name="fit" />
          </button>
          <button
            aria-label="Actual size"
            aria-pressed={viewportPresentation.actualSizePressed}
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={viewportPresentation.unavailable}
            onClick={() => viewportRef.current?.actualSize()}
            title="Actual size (100%)"
            type="button"
          >
            <DrawingToolbarIcon name="actual-size" />
          </button>
          <output
            aria-label="Canvas zoom"
            className="realtime-drawing-zoom-value"
          >
            {viewportPresentation.zoomLabel}
          </output>
          <button
            aria-label="Zoom in"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={!viewportPresentation.canZoomIn}
            onClick={() => viewportRef.current?.zoomIn()}
            title="Zoom in"
            type="button"
          >
            <DrawingToolbarIcon name="zoom-in" />
          </button>
        </div>
        <div className="realtime-drawing-tool-group">
          <button
            aria-label="Show grid"
            aria-pressed={gridVisible}
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={toggleGrid}
            title="Show grid"
            type="button"
          >
            <DrawingToolbarIcon name="grid" />
          </button>
          <button
            aria-label="Snap to grid"
            aria-pressed={gridSnapEnabled}
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={toggleGridSnap}
            title={`Snap to ${DRAWING_GRID_DEFAULT_SPACING}px grid`}
            type="button"
          >
            <DrawingToolbarIcon name="snap" />
          </button>
          <button
            aria-label="Clear drawing"
            className={`realtime-drawing-clear-button realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => drawingRef.current?.clear()}
            title="Clear drawing"
            type="button"
          >
            <DrawingToolbarIcon name="clear" />
          </button>
        </div>
      </div>
      <div
        aria-label={`${section.name} drawing editor`}
        className={`realtime-drawing-stage ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`}
        onKeyDown={handleDrawingKeyDown}
        onLostPointerCapture={endHandPan}
        onPointerCancelCapture={endHandPan}
        onPointerDownCapture={handleStagePointerDownCapture}
        onPointerMoveCapture={handleStagePointerMoveCapture}
        onPointerUpCapture={endHandPan}
        ref={stageRef}
        role="application"
        tabIndex={0}
      >
        <canvas aria-label={section.name} ref={canvasRef} />
      </div>
    </div>
  );
}
