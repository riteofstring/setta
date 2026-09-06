import { useEffect, useRef, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import {
  resolveRuntimeValue,
  runtimeCanInvoke,
  runtimeValueKey,
} from "../app/runtimeState";
import {
  RealtimeDrawingRuntime,
  type DrawingHistoryState,
  type DrawingTool,
} from "./drawingRuntime";
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

export function DrawingSection({ section }: { section: WorkspaceSection }) {
  const { actions, runtime } = useRealtime();
  const data = readDrawingSectionData(section.data);
  const { background, height, width } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<RealtimeDrawingRuntime | null>(null);
  const settlementRef = useRef<DrawingSettlementQueue | null>(null);
  const lastLoadedSceneRef = useRef<string | null>(null);
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
  const runtimeRef = useRef(runtime);
  const canInvoke = runtimeCanInvoke(runtime);
  sceneRef.current = scene;
  runtimeRef.current = runtime;

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) {
      return;
    }
    let settlement: DrawingSettlementQueue | null = null;
    const drawing = new RealtimeDrawingRuntime(element, {
      background,
      height,
      onHistoryChange: setHistory,
      onPreview: () => settlement?.preview(),
      onSettled: () => settlement?.settle(),
      width,
    });
    const stage = stageRef.current;
    if (stage === null) {
      void drawing.dispose();
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (bounds !== undefined) {
        drawing.resizeToFit(bounds.width, bounds.height);
      }
    });
    resizeObserver.observe(stage);
    drawing.resizeToFit(stage.clientWidth, stage.clientHeight);
    settlement = new DrawingSettlementQueue({
      canEmit: () => runtimeCanInvoke(runtimeRef.current),
      capture: () => drawing.captureSnapshot(),
      capturePreview: () => drawing.capturePreview(),
      commit: (nextScene) => {
        lastLoadedSceneRef.current = JSON.stringify(nextScene);
        return actions.commitSectionData(section.id, {
          background,
          height,
          scene: nextScene,
          width,
        });
      },
      delayMilliseconds: SETTLE_DELAY_MILLISECONDS,
      emit: (reference) => {
        actions.emit(section.id, "snapshot", { contentRef: reference });
      },
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
    settlementRef.current = settlement;
    drawingRef.current = drawing;
    const initialScene = sceneRef.current;
    lastLoadedSceneRef.current = JSON.stringify(initialScene);
    void drawing.loadScene(initialScene).catch((error: unknown) => {
      actions.reportError(
        error instanceof Error
          ? error.message
          : "Realtime could not load the drawing scene.",
      );
    });
    return () => {
      resizeObserver.disconnect();
      settlement?.dispose();
      if (settlementRef.current === settlement) {
        settlementRef.current = null;
      }
      drawingRef.current = null;
      void drawing.dispose();
    };
  }, [actions, background, height, section.id, width]);

  useEffect(() => {
    if (canInvoke) {
      settlementRef.current?.resume();
    }
  }, [canInvoke]);

  useEffect(() => {
    const drawing = drawingRef.current;
    const sceneKey = JSON.stringify(scene);
    if (drawing !== null && sceneKey !== lastLoadedSceneRef.current) {
      lastLoadedSceneRef.current = sceneKey;
      void drawing.loadScene(scene).catch((error: unknown) => {
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
        className={`realtime-drawing-stage ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
        ref={stageRef}
      >
        <canvas aria-label={section.name} ref={canvasRef} />
      </div>
    </div>
  );
}
