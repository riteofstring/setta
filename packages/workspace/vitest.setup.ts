// jsdom does not implement ResizeObserver, and @dnd-kit/dom constructs one at import time, so
// component tests need the constructor before any test module loads.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom does not measure DOM ranges, and CodeMirror's coordinate lookups (posAtCoords during
// the text control's pointer activation) call Range#getClientRects. Empty rect lists make
// those lookups resolve to null, which the activation path already handles; the browser build
// measures real geometry.
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
