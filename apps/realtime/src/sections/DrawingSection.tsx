import { useEffect, useRef, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  type WorkspaceSection,
  type WorkspaceSectionData,
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
import { DrawingSettlementQueue } from "./drawingSettlementQueue";
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

export function DrawingSection({ section }: { section: WorkspaceSection }) {
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
  const sceneRef = useRef(scene);
  const projectRef = useRef(project);
  const runtimeRef = useRef(runtime);
  const snapshotCanEmit = canEmitSnapshot(project, runtime, section.id);
  const capacityKey = snapshotCapacityKey(project, runtime, section.id);
  sceneRef.current = scene;
  projectRef.current = project;
  runtimeRef.current = runtime;

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) {
      return;
    }
    const initialScene = sceneRef.current;
    const sceneAuthority = new DrawingSceneAuthority(initialScene);
    let settlement: DrawingSettlementQueue | null = null;
    const drawing = new RealtimeDrawingRuntime(element, {
      background,
      height,
      onHistoryChange: setHistory,
      onPreview: () => {
        sceneAuthority.localChange();
        settlement?.preview();
      },
      onSettled: () => {
        sceneAuthority.localChange();
        settlement?.settle();
      },
      width,
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
      commit: async (nextScene) => {
        const pending = sceneAuthority.prepareCommit(nextScene);
        const committed = await actions.commitSectionData(section.id, {
          background,
          height,
          scene: nextScene,
          width,
        });
        if (committed) {
          sceneAuthority.acknowledge(pending, drawing.toScene());
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
    void drawing
      .loadScene(initialScene)
      .then((loaded) => {
        if (loaded) {
          sceneAuthority.loaded(initialScene);
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
  }, [actions, background, height, section.id, width]);

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
      sceneAuthority.shouldLoad(scene)
    ) {
      void drawing
        .loadScene(scene)
        .then((loaded) => {
          if (loaded) {
            sceneAuthority.loaded(scene);
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
  }, [actions, scene]);

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
