import { afterEach, describe, expect, it, vi } from "vitest";
import { attachParamAreaObservers } from "./paramAreaObservers";

describe("attachParamAreaObservers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires ResizeObserver, childList-only MutationObserver, and input listeners", () => {
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

    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const rows = {
      id: "rows",
      addEventListener,
      removeEventListener,
    } as unknown as HTMLElement;
    const header = { id: "header" } as HTMLElement;
    const onMeasure = vi.fn();

    const cleanup = attachParamAreaObservers({
      rowsElement: rows,
      headerElement: header,
      onMeasure,
    });

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(rows);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(header);
    expect(mutationObservers).toHaveLength(1);
    expect(mutationObservers[0].observe).toHaveBeenCalledWith(rows, {
      childList: true,
      subtree: true,
    });
    expect(addEventListener).toHaveBeenCalledWith("input", onMeasure);
    expect(addEventListener).toHaveBeenCalledWith("change", onMeasure);
    expect(addEventListener).toHaveBeenCalledWith("compositionend", onMeasure);

    cleanup();

    expect(removeEventListener).toHaveBeenCalledWith("input", onMeasure);
    expect(removeEventListener).toHaveBeenCalledWith("change", onMeasure);
    expect(removeEventListener).toHaveBeenCalledWith(
      "compositionend",
      onMeasure,
    );
    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    expect(mutationObservers[0].disconnect).toHaveBeenCalled();
  });
});
