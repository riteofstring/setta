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
