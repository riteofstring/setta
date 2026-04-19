import { describe, expect, it, vi } from "vitest";

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: {
    getState: () => ({
      transform: [0, 0, 1],
    }),
  },
}));

import { getOnCreateEditor } from "./getOnCreateEditor";

describe("getOnCreateEditor", () => {
  it("keeps pointer-position selection when the editor can resolve the click coordinates", () => {
    const setRealIsInitialized = vi.fn();
    const focus = vi.fn();
    const posAtCoords = vi.fn(() => 7);
    const dispatch = vi.fn();

    const onCreateEditor = getOnCreateEditor({
      initialEvent: {
        clientX: 12,
        clientY: 24,
      },
      setRealIsInitialized,
      divId: "editor",
      value: "value",
      defaultVal: "",
    });

    onCreateEditor({
      contentDOM: { focus },
      posAtCoords,
      dispatch,
    });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(posAtCoords).toHaveBeenCalledWith({ x: 12, y: 24 });
    expect(dispatch).toHaveBeenCalledWith({
      selection: { anchor: 7, head: 7 },
    });
    expect(setRealIsInitialized).toHaveBeenCalledWith(true);
  });

  it("still initializes when the click coordinates do not map into the editor", () => {
    const setRealIsInitialized = vi.fn();
    const focus = vi.fn();
    const posAtCoords = vi.fn(() => null);
    const dispatch = vi.fn();

    const onCreateEditor = getOnCreateEditor({
      initialEvent: {
        clientX: 12,
        clientY: 24,
      },
      setRealIsInitialized,
      divId: "editor",
      value: "value",
      defaultVal: "",
    });

    onCreateEditor({
      contentDOM: { focus },
      posAtCoords,
      dispatch,
    });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(posAtCoords).toHaveBeenCalledWith({ x: 12, y: 24 });
    expect(dispatch).not.toHaveBeenCalled();
    expect(setRealIsInitialized).toHaveBeenCalledWith(true);
  });
});
