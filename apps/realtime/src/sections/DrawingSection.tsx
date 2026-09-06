import { useEffect, useRef, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import { runtimeValueKey } from "../app/runtimeState";
import { RealtimeDrawingRuntime, type DrawingTool } from "./drawingRuntime";
import { readDrawingSectionData } from "./sectionData";

const SETTLE_DELAY_MILLISECONDS = 180;

export function DrawingSection({ section }: { section: WorkspaceSection }) {
  const { actions, runtime } = useRealtime();
  const data = readDrawingSectionData(section.data);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<RealtimeDrawingRuntime | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const settleSequenceRef = useRef(0);
  const settleRef = useRef<() => void>(() => {});
  const lastLoadedSceneRef = useRef<string | null>(null);
  const [tool, setTool] = useState<DrawingTool>("select");
  const runtimeScene = runtime.values[runtimeValueKey(section.id, "scene")];
  const scene = (runtimeScene ?? data.scene) as WorkspaceSectionData;

  settleRef.current = () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      const drawing = drawingRef.current;
      if (drawing === null) {
        return;
      }
      const sequence = ++settleSequenceRef.current;
      const nextScene = drawing.toScene();
      void actions
        .commitSectionData(section.id, { ...data, scene: nextScene })
        .then(async (committed) => {
          if (!committed || sequence !== settleSequenceRef.current) {
            return;
          }
          const reference = await actions.uploadContent(await drawing.toBlob());
          if (sequence === settleSequenceRef.current) {
            actions.emit(section.id, "snapshot", {
              contentRef: reference,
            });
          }
        })
        .catch((error: unknown) => {
          actions.reportError(
            error instanceof Error
              ? error.message
              : "Realtime could not settle the drawing.",
          );
        });
    }, SETTLE_DELAY_MILLISECONDS);
  };

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) {
      return;
    }
    const drawing = new RealtimeDrawingRuntime(element, {
      background: data.background,
      height: data.height,
      onSettled: () => settleRef.current(),
      width: data.width,
    });
    drawingRef.current = drawing;
    lastLoadedSceneRef.current = JSON.stringify(scene);
    void drawing.loadScene(scene).catch((error: unknown) => {
      actions.reportError(
        error instanceof Error
          ? error.message
          : "Realtime could not load the drawing scene.",
      );
    });
    return () => {
      ++settleSequenceRef.current;
      drawingRef.current = null;
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      void drawing.dispose();
    };
  }, [actions, data.background, data.height, data.width]);

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
