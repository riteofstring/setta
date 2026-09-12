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
  type DrawingTool,
} from "./drawingRuntime";
import { DrawingSceneAuthority } from "./drawingSceneAuthority";
import {
  DrawingSettlementQueue,
  type DrawingSnapshot,
} from "./drawingSettlementQueue";
import { registerDrawingSurface } from "./drawingSurfaceRegistry";
import { DrawingToolbarIcon } from "./DrawingToolbarIcon";
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
  select: "Select",
};
const TERMINAL_INVOCATION_STATES = new Set([
  "cancelled",
  "completed",
  "crashed",
  "failed",
  "superseded",
  "timedOut",
]);

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

export function DrawingSection({ section }: { section: WorkspaceSection }) {
  const host = useWorkspaceHost();
  const { actions, project, runtime } = useRealtime();
  const data = readDrawingSectionData(section.data);
  const { background, height, width } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<RealtimeDrawingRuntime | null>(null);
  const sceneAuthorityRef = useRef<DrawingSceneAuthority | null>(null);
  const settlementRef = useRef<DrawingSettlementQueue | null>(null);
  const [brushColor, setBrushColor] = useState("#111827");
  const [brushWidth, setBrushWidth] = useState(4);
  const [history, setHistory] = useState(INITIAL_HISTORY_STATE);
  const [tool, setTool] = useState<DrawingTool>("draw");
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
    const stage = stageRef.current;
    if (stage === null) {
      void drawing.dispose();
      return;
    }
    const preventSectionActivation = (event: MouseEvent) => {
      event.stopPropagation();
    };
    stage.addEventListener("click", preventSectionActivation);
    const resizeObserver = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (bounds !== undefined) {
        drawing.resizeToFit(bounds.width, bounds.height);
      }
    });
    resizeObserver.observe(stage);
    drawing.resizeToFit(stage.clientWidth, stage.clientHeight);
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
    const unregisterDrawingSurface = registerDrawingSurface(host, section.id, {
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
      resizeCanvas: (request) => drawing.resizeCanvas(request),
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
      unregisterDrawingSurface();
      settlement?.dispose();
      if (settlementRef.current === settlement) {
        settlementRef.current = null;
      }
      if (sceneAuthorityRef.current === sceneAuthority) {
        sceneAuthorityRef.current = null;
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
    setBrushColor(nextColor);
    drawingRef.current?.setBrush(nextColor, brushWidth);
  };

  const changeBrushWidth = (nextWidth: number) => {
    setBrushWidth(nextWidth);
    drawingRef.current?.setBrush(brushColor, nextWidth);
  };

  return (
    <div className="realtime-drawing">
      <div
        aria-label="Drawing tools"
        className="realtime-drawing-toolbar"
        role="toolbar"
      >
        <div className="realtime-drawing-tool-group">
          {(["select", "draw", "erase"] as const).map((candidate) => (
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
          ))}
        </div>
        <div className="realtime-drawing-tool-group realtime-drawing-brush-controls">
          <label aria-label="Brush color" title="Brush color">
            <input
              className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
              onChange={(event) => changeBrushColor(event.currentTarget.value)}
              type="color"
              value={brushColor}
            />
          </label>
          <label className="realtime-drawing-size" title="Brush size">
            <span className="realtime-drawing-size-label">Size</span>
            <input
              aria-label="Brush size"
              className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
              max={24}
              min={1}
              onChange={(event) =>
                changeBrushWidth(Number(event.currentTarget.value))
              }
              type="range"
              value={brushWidth}
            />
            <output>{brushWidth}px</output>
          </label>
        </div>
        <div className="realtime-drawing-tool-group">
          <button
            aria-label="Add rectangle"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => drawingRef.current?.addRectangle()}
            title="Add rectangle"
            type="button"
          >
            <DrawingToolbarIcon name="rectangle" />
          </button>
          <button
            aria-label="Add ellipse"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => drawingRef.current?.addEllipse()}
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
          <button
            aria-label="Delete selection"
            className={`realtime-drawing-icon-button ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            onClick={() => drawingRef.current?.deleteSelection()}
            title="Delete selection"
            type="button"
          >
            <DrawingToolbarIcon name="delete" />
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
        className={`realtime-drawing-stage ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`}
        ref={stageRef}
      >
        <canvas aria-label={section.name} ref={canvasRef} />
      </div>
    </div>
  );
}
