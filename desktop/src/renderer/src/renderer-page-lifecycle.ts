const rendererPageTeardownCallbacks = new Set<() => void>();
let rendererPageTearingDown = false;

export function registerRendererPageTeardown(callback: () => void): () => void {
  if (rendererPageTearingDown) {
    callback();
    return () => {};
  }
  rendererPageTeardownCallbacks.add(callback);
  return () => {
    rendererPageTeardownCallbacks.delete(callback);
  };
}

export function runRendererPageTeardown(): void {
  if (rendererPageTearingDown) {
    return;
  }
  rendererPageTearingDown = true;
  for (const callback of [...rendererPageTeardownCallbacks]) {
    callback();
  }
  rendererPageTeardownCallbacks.clear();
}
