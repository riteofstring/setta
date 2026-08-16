// jsdom does not implement ResizeObserver, and @dnd-kit/dom (reached through the built
// @setta/workspace) constructs one at import time, so component tests need the constructor
// before any test module loads. Mirrors packages/workspace/vitest.setup.ts.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub;
}

// jsdom does not measure DOM ranges, and CodeMirror's coordinate lookups inside the built
// package's text value editor call Range#getClientRects. Empty rect lists make those lookups
// resolve to null instead of throwing. Mirrors packages/workspace/vitest.setup.ts.
const emptyRectList = () =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: Array.prototype[Symbol.iterator],
  }) as unknown as DOMRectList;

if (typeof Range !== "undefined") {
  if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = emptyRectList;
  }
  if (typeof Range.prototype.getBoundingClientRect !== "function") {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
}
