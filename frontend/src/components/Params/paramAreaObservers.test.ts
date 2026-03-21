import { afterEach, describe, expect, it, vi } from "vitest";
import { attachParamAreaObservers } from "./paramAreaObservers";

describe("attachParamAreaObservers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires ResizeObserver and input listeners without mutation observers", () => {
    const resizeObservers: Array<{
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

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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
  });
});
