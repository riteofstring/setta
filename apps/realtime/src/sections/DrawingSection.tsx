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
import { RealtimeDrawingRuntime, type DrawingTool } from "./drawingRuntime";
import { DrawingSettlementQueue } from "./drawingSettlementQueue";
import { readDrawingSectionData } from "./sectionData";

const SETTLE_DELAY_MILLISECONDS = 180;

export function DrawingSection({ section }: { section: WorkspaceSection }) {
  const { actions, runtime } = useRealtime();
  const data = readDrawingSectionData(section.data);
  const { background, height, width } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<RealtimeDrawingRuntime | null>(null);
  const lastLoadedSceneRef = useRef<string | null>(null);
  const [tool, setTool] = useState<DrawingTool>("select");
  const scene = resolveRuntimeValue(
    runtime.values,
    runtimeValueKey(section.id, "scene"),
    data.scene,
  ) as WorkspaceSectionData;
  const sceneRef = useRef(scene);
  const runtimeRef = useRef(runtime);
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
      onSettled: () => settlement?.settle(),
      width,
    });
    settlement = new DrawingSettlementQueue({
      canEmit: () => runtimeCanInvoke(runtimeRef.current),
      capture: () => drawing.captureSnapshot(),
      commit: (nextScene) =>
        actions.commitSectionData(section.id, {
          background,
          height,
          scene: nextScene,
          width,
        }),
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
      upload: actions.uploadContent,
    });
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
      settlement?.dispose();
      drawingRef.current = null;
      void drawing.dispose();
    };
  }, [actions, background, height, section.id, width]);

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

  return (
    <div className="realtime-drawing">
      <div
        aria-label="Drawing tools"
        className="realtime-drawing-toolbar"
        role="toolbar"
      >
        {(["select", "draw", "erase"] as const).map((candidate) => (
          <button
            aria-pressed={tool === candidate}
            className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
            key={candidate}
            onClick={() => chooseTool(candidate)}
            type="button"
          >
            {candidate[0]?.toUpperCase()}
            {candidate.slice(1)}
          </button>
        ))}
        <button
          className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
          onClick={() => drawingRef.current?.addRectangle()}
          type="button"
        >
          Rectangle
        </button>
        <button
          className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
          onClick={() => drawingRef.current?.clear()}
          type="button"
        >
          Clear
        </button>
      </div>
      <div
        className={`realtime-drawing-stage ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
      >
        <canvas aria-label={section.name} ref={canvasRef} />
      </div>
    </div>
  );
}
