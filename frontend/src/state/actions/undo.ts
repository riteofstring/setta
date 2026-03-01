import { route_redo, route_undo } from "utils/generatedEndpoints";
import { getCurrProjectConfigId } from "./sectionInfos";

let queuedUndoRedoDelta = 0;
let isUndoRedoFlushScheduled = false;
let undoRedoFlushPromise: Promise<void> | null = null;

function logUndoRedoEvent(event: string, payload: unknown): void {
  console.log(`[undo-redo-debug] ${event} ${JSON.stringify(payload)}`);
}

async function runUndoRedoQueue(): Promise<void> {
  while (queuedUndoRedoDelta !== 0) {
    const deltaToApply = queuedUndoRedoDelta;
    queuedUndoRedoDelta = 0;
    const isUndo = deltaToApply < 0;
    const payload = {
      steps: Math.abs(deltaToApply),
      projectConfigId: getCurrProjectConfigId(),
    };
    if (isUndo) {
      logUndoRedoEvent("undo.request", payload);
      const response = await route_undo(payload);
      logUndoRedoEvent("undo.response", {
        payload,
        response,
      });
      continue;
    }
    logUndoRedoEvent("redo.request", payload);
    const response = await route_redo(payload);
    logUndoRedoEvent("redo.response", {
      payload,
      response,
    });
  }
}

function scheduleUndoRedoFlush(): void {
  if (isUndoRedoFlushScheduled || undoRedoFlushPromise !== null) {
    return;
  }
  isUndoRedoFlushScheduled = true;
  queueMicrotask(() => {
    isUndoRedoFlushScheduled = false;
    undoRedoFlushPromise = runUndoRedoQueue().finally(() => {
      undoRedoFlushPromise = null;
      if (queuedUndoRedoDelta !== 0) {
        scheduleUndoRedoFlush();
      }
    });
  });
}

function queueUndoRedoDelta(delta: number): void {
  queuedUndoRedoDelta += delta;
  scheduleUndoRedoFlush();
}

export function resetUndoRedoQueueForTests(): void {
  queuedUndoRedoDelta = 0;
  isUndoRedoFlushScheduled = false;
  undoRedoFlushPromise = null;
}

export async function flushUndoRedoQueueForTests(): Promise<void> {
  while (isUndoRedoFlushScheduled || undoRedoFlushPromise !== null) {
    const activeFlushPromise = undoRedoFlushPromise;
    if (activeFlushPromise !== null) {
      await activeFlushPromise;
      continue;
    }
    await Promise.resolve();
  }
}

export function undoProjectState() {
  queueUndoRedoDelta(-1);
}

export function redoProjectState() {
  queueUndoRedoDelta(1);
}
