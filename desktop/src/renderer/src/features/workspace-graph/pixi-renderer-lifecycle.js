export function abortInitializedAppIfNeeded(app, abortSignal) {
  if (!rendererInitAborted(abortSignal)) {
    return;
  }
  destroyInitializedApp(app);
  throwIfRendererInitAborted(abortSignal);
}

export function destroyInitializedApp(app) {
  const canvas = app.canvas;
  app.destroy(false, { children: true });
  canvas.remove();
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
