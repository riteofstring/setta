/* global window */

export function abortInitializedAppIfNeeded(app, abortSignal) {
  if (!rendererInitAborted(abortSignal)) {
    return;
  }
  destroyInitializedApp(app);
  throwIfRendererInitAborted(abortSignal);
}

function destroyInitializedApp(app) {
  const canvas = app.canvas;
  app.destroy(false, { children: true });
  canvas.remove();
}

export function registerWorkflowGraphRendererEvents({
  canvas,
  contextMenu,
  keyDown,
  pointerCancel,
  pointerDown,
  pointerLeave,
  pointerMove,
  pointerUp,
  wheel,
}) {
  canvas.addEventListener("pointerdown", pointerDown, true);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("contextmenu", contextMenu);
  canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerCancel);
  window.addEventListener("keydown", keyDown);
  return () => {
    canvas.removeEventListener("pointerdown", pointerDown, true);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerleave", pointerLeave);
    canvas.removeEventListener("contextmenu", contextMenu);
    canvas.removeEventListener("wheel", wheel, true);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerCancel);
    window.removeEventListener("keydown", keyDown);
  };
}

export function destroyWorkflowGraphRenderer({
  app,
  edgeLabels,
  labels,
  nodeLabels,
  unregisterDebugSurface,
  unregisterRendererEvents,
}) {
  unregisterRendererEvents();
  unregisterDebugSurface?.();
  for (const nodeId of [...nodeLabels.keys()]) {
    labels.releaseLabel(nodeId);
  }
  edgeLabels.destroyAll();
  destroyInitializedApp(app);
}

export function throwIfRendererInitAborted(abortSignal) {
  if (!abortSignal) {
    return;
  }
  if (typeof abortSignal.throwIfAborted === "function") {
    abortSignal.throwIfAborted();
    return;
  }
  if (abortSignal.aborted) {
    throw new Error("Workflow graph renderer initialization aborted");
  }
}

function rendererInitAborted(abortSignal) {
  return Boolean(abortSignal?.aborted);
}
