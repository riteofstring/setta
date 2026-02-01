import { afterEach, describe, expect, it, vi } from "vitest";
import { attachParamAreaObservers } from "./paramAreaObservers";

describe("attachParamAreaObservers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires ResizeObserver and childList-only MutationObserver", () => {
    const resizeObservers: Array<{
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    const mutationObservers: Array<{
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];

    class ResizeObserverMock {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: ResizeObserverCallback) {
        resizeObservers.push(this);
      }
    }

    class MutationObserverMock {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: MutationCallback) {
        mutationObservers.push(this);
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("MutationObserver", MutationObserverMock);

    const rows = { id: "rows" } as HTMLElement;
    const header = { id: "header" } as HTMLElement;

    const cleanup = attachParamAreaObservers({
      rowsElement: rows,
      headerElement: header,
      onMeasure: () => undefined,
    });

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(rows);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(header);
    expect(mutationObservers).toHaveLength(1);
    expect(mutationObservers[0].observe).toHaveBeenCalledWith(rows, {
      childList: true,
      subtree: true,
    });

    cleanup();

    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    expect(mutationObservers[0].disconnect).toHaveBeenCalled();
  });
});
