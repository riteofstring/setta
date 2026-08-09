// jsdom does not implement ResizeObserver, and @dnd-kit/dom (reached through the built
// @setta/workspace) constructs one at import time, so component tests need the constructor
// before any test module loads. Mirrors packages/workspace/vitest.setup.ts.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
