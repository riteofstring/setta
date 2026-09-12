import { useEffect, useMemo, useRef, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  setWorkspaceSectionSize,
  WorkspaceDropdownMenu,
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
  type DrawingCreationColorTarget,
  type DrawingHistoryState,
  type DrawingPlacementTool,
  type DrawingSelectionSnapshot,
  type DrawingTool,
} from "./drawingRuntime";
import { prepareDrawingImage } from "./drawingImage";
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
import {
  drawingSelectionColorPatch,
  drawingSelectionPaintLabel,
  drawingToolbarSelectionPaints,
  type DrawingSelectionPaint,
} from "./drawingToolbarSelection";
import { DrawingToolbarIcon } from "./DrawingToolbarIcon";
import { DrawingViewportController } from "./drawingViewportController";
import { readDrawingSectionData } from "./sectionData";

const SETTLE_DELAY_MILLISECONDS = 180;
const PREVIEW_DELAY_MILLISECONDS = 90;
const INITIAL_HISTORY_STATE: DrawingHistoryState = {
  canRedo: false,
  canUndo: false,
};
const DRAWING_TOOL_LABELS: Record<DrawingTool, string> = {
  arrow: "Arrow",
  draw: "Pen",
  ellipse: "Ellipse",
  erase: "Eraser",
  highlighter: "Highlighter",
  line: "Line",
  rectangle: "Rectangle",
  select: "Select",
  text: "Text",
};
const DRAWING_SHAPE_TOOLS = [
  "line",
  "arrow",
  "rectangle",
  "ellipse",
] as const satisfies ReadonlyArray<Exclude<DrawingPlacementTool, "text">>;
const DRAWING_SHAPE_TOOL_GROUPS = [
  { label: "Lines", tools: ["line", "arrow"] },
  { label: "Shapes", tools: ["rectangle", "ellipse"] },
] as const satisfies ReadonlyArray<{
  label: string;
  tools: ReadonlyArray<Exclude<DrawingPlacementTool, "text">>;
}>;
type DrawingBrushSettings = {
  color: string;
  width: number;
};
type DrawingCreationColors = Record<DrawingCreationColorTarget, string>;
type DrawingCreationPaint = {
  color: string;
  label: string;
  target: DrawingCreationColorTarget;
};
type DrawingBrushPresentation = {
  label: "Highlighter" | "Pen";
  maxWidth: number;
  settings: DrawingBrushSettings;
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
const INITIAL_CREATION_COLORS: DrawingCreationColors = {
  fill: "#e5ecfd",
  line: "#111827",
  "shape-stroke": "#2563eb",
  text: "#111827",
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
      label: "Highlighter",
      maxWidth: 64,
      settings: highlighter,
    };
  }
  return {
    label: "Pen",
    maxWidth: 32,
    settings: pen,
  };
}

function drawingCreationPaints(
  tool: DrawingTool,
  colors: DrawingCreationColors,
): DrawingCreationPaint[] {
  if (tool === "text") {
    return [{ color: colors.text, label: "Color", target: "text" }];
  }
  if (tool === "line" || tool === "arrow") {
    return [{ color: colors.line, label: "Color", target: "line" }];
  }
  if (tool === "rectangle" || tool === "ellipse") {
    return [
      { color: colors.fill, label: "Fill", target: "fill" },
      {
        color: colors["shape-stroke"],
        label: "Stroke",
        target: "shape-stroke",
      },
    ];
  }
  return [];
}

function drawingCreationPaintLabel(tool: DrawingTool, label: string): string {
  const toolLabel = DRAWING_TOOL_LABELS[tool];
  return label === "Color"
    ? `${toolLabel} color`
    : `${toolLabel} ${label.toLowerCase()} color`;
}

function isDrawingShapeTool(value: string): value is DrawingTool {
  return DRAWING_SHAPE_TOOLS.some((tool) => tool === value);
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

function drawingDocumentKey(document: DrawingAuthorityDocument): string {
  return JSON.stringify(document);
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<RealtimeDrawingRuntime | null>(null);
  const viewportRef = useRef<DrawingViewportController | null>(null);
  const sceneAuthorityRef = useRef<DrawingSceneAuthority | null>(null);
  const settlementRef = useRef<DrawingSettlementQueue | null>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);
  const [loadedDocumentRevision, setLoadedDocumentRevision] = useState(0);
  const [history, setHistory] = useState(INITIAL_HISTORY_STATE);
  const [highlighter, setHighlighter] =
    useState<DrawingBrushSettings>(INITIAL_HIGHLIGHTER);
  const [pen, setPen] = useState<DrawingBrushSettings>(INITIAL_PEN);
  const [creationColors, setCreationColors] = useState<DrawingCreationColors>(
    INITIAL_CREATION_COLORS,
  );
  const [importingImage, setImportingImage] = useState(false);
  const [selection, setSelection] = useState<DrawingSelectionSnapshot>(
    EMPTY_DRAWING_SELECTION_SNAPSHOT,
  );
  const [tool, setTool] = useState<DrawingTool>("draw");
  const creationColorsRef = useRef(creationColors);
  const gridSnapEnabledRef = useRef(false);
  const gridVisibleRef = useRef(false);
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
  creationColorsRef.current = creationColors;

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) {
      return;
    }
    loadedDocumentKeyRef.current = null;
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
      onToolChange: setTool,
      width: initialDocument.width,
    });
    for (const [target, color] of Object.entries(
      creationColorsRef.current,
    ) as Array<[DrawingCreationColorTarget, string]>) {
      drawing.setCreationColor(target, color);
    }
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
          const currentDocument = drawingAuthorityValue(background, {
            ...drawing.getLogicalSize(),
            scene: drawing.toScene(),
          });
          const acknowledged = sceneAuthority.acknowledge(
            pending,
            currentDocument,
          );
          if (acknowledged && drawingRef.current === drawing) {
            loadedDocumentKeyRef.current = drawingDocumentKey(currentDocument);
            setLoadedDocumentRevision((revision) => revision + 1);
          }
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
      clearDrawing: () => drawing.clear(),
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
      getGridOptions: () => ({
        snapEnabled: gridSnapEnabledRef.current,
        visible: gridVisibleRef.current,
      }),
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
      setGridSnapEnabled: (enabled) => {
        if (gridSnapEnabledRef.current === enabled) {
          return false;
        }
        gridSnapEnabledRef.current = enabled;
        drawing.setGridSnap(enabled ? DRAWING_GRID_DEFAULT_SPACING : null);
        return true;
      },
      setGridVisible: (visible) => {
        if (gridVisibleRef.current === visible) {
          return false;
        }
        gridVisibleRef.current = visible;
        drawingViewport.setGrid({
          spacing: DRAWING_GRID_DEFAULT_SPACING,
          visible,
        });
        return true;
      },
      subscribeSelection: (listener) => drawing.subscribeSelection(listener),
      toggleSelectionLock: () => drawing.toggleSelectionLock(),
      ungroupSelection: () => drawing.ungroupSelection(),
    });
    void drawing
      .loadScene(initialDocument.scene)
      .then((loaded) => {
        if (loaded && drawingRef.current === drawing) {
          sceneAuthority.loaded(initialDocument);
          loadedDocumentKeyRef.current = drawingDocumentKey(initialDocument);
          setLoadedDocumentRevision((revision) => revision + 1);
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
      loadedDocumentKeyRef.current = null;
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
      loadedDocumentKeyRef.current = null;
      void drawing
        .loadDocument({ height, scene, width })
        .then((loaded) => {
          if (
            loaded &&
            drawingRef.current === drawing &&
            sceneAuthorityRef.current === sceneAuthority
          ) {
            sceneAuthority.loaded(drawingDocument);
            viewportRef.current?.resizeLogical({ height, width });
            loadedDocumentKeyRef.current = drawingDocumentKey(drawingDocument);
            setLoadedDocumentRevision((revision) => revision + 1);
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

  useEffect(() => {
    if (
      loadedDocumentKeyRef.current === null ||
      loadedDocumentKeyRef.current !== drawingDocumentKey(drawingDocument)
    ) {
      return;
    }
    void actions
      .initialize(section.id, "snapshot", async () => {
        const drawing = drawingRef.current;
        if (drawing === null) {
          throw new Error("The drawing surface is unavailable.");
        }
        const snapshot = await drawing.captureSnapshot();
        if (drawingRef.current !== drawing) {
          throw new Error("The drawing surface changed during initialization.");
        }
        const reference = await actions.uploadContent(snapshot.blob);
        return { contentRef: reference };
      })
      .catch((error: unknown) => {
        actions.reportError(
          error instanceof Error
            ? error.message
            : "Realtime could not initialize the drawing.",
        );
      });
  }, [
    actions,
    drawingDocument,
    loadedDocumentRevision,
    project.revision,
    runtime.connection,
    runtime.sessionId,
    runtime.workerState,
    section.id,
  ]);

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

  const changeCreationColor = (
    target: DrawingCreationColorTarget,
    color: string,
  ) => {
    setCreationColors((current) => ({ ...current, [target]: color }));
    drawingRef.current?.setCreationColor(target, color);
  };

  const changeSelectionColor = (
    target: DrawingSelectionPaint["target"],
    color: string,
  ) => {
    drawingRef.current?.setSelectionAppearance(
      drawingSelectionColorPatch(target, color),
    );
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

  const handleImageFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    const drawing = drawingRef.current;
    setImportingImage(true);
    try {
      const source = await prepareDrawingImage(file);
      if (
        drawing === null ||
        drawingRef.current !== drawing ||
        !(await drawing.addImage(source))
      ) {
        throw new Error("Realtime could not add this image to the drawing.");
      }
    } catch (error) {
      actions.reportError(
        error instanceof Error
          ? error.message
          : "Realtime could not add this image to the drawing.",
      );
    } finally {
      input.value = "";
      setImportingImage(false);
    }
  };

  const brushPresentation =
    tool === "draw" || tool === "highlighter"
      ? drawingBrushPresentation(tool, pen, highlighter)
      : null;
  const creationPaints = drawingCreationPaints(tool, creationColors);
  const selectionPaints = drawingToolbarSelectionPaints(tool, selection);

  return (
    <div className="realtime-drawing">
      <div
        aria-label="Drawing tools"
        className="realtime-drawing-toolbar"
        role="toolbar"
      >
        <div className="realtime-drawing-tool-group">
          {(["select", "draw", "highlighter", "erase", "text"] as const).map(
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
                <DrawingToolbarIcon
                  accentColor={
                    candidate === "highlighter" ? highlighter.color : undefined
                  }
                  name={candidate}
                />
              </button>
            ),
          )}
        </div>
        <div className="realtime-drawing-tool-group">
          <WorkspaceDropdownMenu
            ariaLabel="Draw a line or shape"
            className={`realtime-drawing-shape-trigger ${isDrawingShapeTool(tool) ? "realtime-drawing-shape-trigger-active" : ""} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            groups={DRAWING_SHAPE_TOOL_GROUPS.map((group) => ({
              items: group.tools.map((shape) => ({
                id: shape,
                label: DRAWING_TOOL_LABELS[shape],
                onSelect: () => chooseTool(shape),
              })),
              label: group.label,
            }))}
            selectedItemId={isDrawingShapeTool(tool) ? tool : ""}
            title="Draw a line or shape"
          >
            <DrawingToolbarIcon name="shapes" />
            <span>
              {isDrawingShapeTool(tool)
                ? DRAWING_TOOL_LABELS[tool]
                : "Line & shape"}
            </span>
          </WorkspaceDropdownMenu>
          <button
            aria-label="Add image"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            disabled={importingImage}
            onClick={() => imageInputRef.current?.click()}
            title="Add image"
            type="button"
          >
            <DrawingToolbarIcon name="image" />
          </button>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose drawing image"
            hidden
            onChange={(event) => void handleImageFile(event)}
            ref={imageInputRef}
            type="file"
          />
        </div>
        {brushPresentation === null ? null : (
          <div className="realtime-drawing-tool-group realtime-drawing-brush-controls">
            <label
              aria-label={`${brushPresentation.label} color`}
              className="realtime-drawing-toolbar-color"
              title={`${brushPresentation.label} color`}
            >
              <span>Color</span>
              <input
                aria-label={`${brushPresentation.label} color`}
                className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
                onChange={(event) =>
                  changeBrushColor(event.currentTarget.value)
                }
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
        )}
        {creationPaints.length === 0 ? null : (
          <div className="realtime-drawing-tool-group realtime-drawing-creation-colors">
            {creationPaints.map((paint) => (
              <label
                className="realtime-drawing-toolbar-color"
                key={paint.target}
                title={drawingCreationPaintLabel(tool, paint.label)}
              >
                <span>{paint.label}</span>
                <input
                  aria-label={drawingCreationPaintLabel(tool, paint.label)}
                  className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
                  onChange={(event) =>
                    changeCreationColor(paint.target, event.currentTarget.value)
                  }
                  type="color"
                  value={paint.color}
                />
              </label>
            ))}
          </div>
        )}
        {selectionPaints.length === 0 ? null : (
          <div className="realtime-drawing-tool-group realtime-drawing-creation-colors">
            {selectionPaints.map((paint) => (
              <label
                className="realtime-drawing-toolbar-color"
                key={paint.target}
                title={drawingSelectionPaintLabel(selection, paint)}
              >
                <span>{paint.label}</span>
                <input
                  aria-label={drawingSelectionPaintLabel(selection, paint)}
                  className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
                  onChange={(event) =>
                    changeSelectionColor(
                      paint.target,
                      event.currentTarget.value,
                    )
                  }
                  type="color"
                  value={paint.color}
                />
              </label>
            ))}
          </div>
        )}
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
      </div>
      <div
        aria-label={`${section.name} drawing editor`}
        className={`realtime-drawing-stage ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`}
        onKeyDown={handleDrawingKeyDown}
        onPointerDownCapture={(event) =>
          event.currentTarget.focus({ preventScroll: true })
        }
        ref={stageRef}
        role="application"
        tabIndex={0}
      >
        <canvas aria-label={section.name} ref={canvasRef} />
      </div>
    </div>
  );
}
