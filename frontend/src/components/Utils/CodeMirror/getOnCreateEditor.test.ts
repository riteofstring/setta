/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOnCreateEditor } from "./getOnCreateEditor";

const { getStateMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(() => ({ transform: [0, 0, 1] })),
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: {
    getState: getStateMock,
  },
}));

type EditorViewLike = {
  contentDOM: { focus: (options?: { preventScroll?: boolean }) => void };
  focus: () => void;
  posAtCoords: (coords: { x: number; y: number }) => number | null;
  dispatch: (transaction: unknown) => void;
  dom: HTMLDivElement;
};

function createView({
  pos = 0,
}: {
  pos?: number | null;
} = {}): {
  view: EditorViewLike;
  dispatchMock: ReturnType<typeof vi.fn>;
  contentFocusMock: ReturnType<typeof vi.fn>;
  fallbackFocusMock: ReturnType<typeof vi.fn>;
  internalCursor: HTMLDivElement;
} {
  const contentFocusMock = vi.fn();
  const fallbackFocusMock = vi.fn();
  const dispatchMock = vi.fn();
  const dom = document.createElement("div");
  const internalCursor = document.createElement("div");
  internalCursor.className = "cm-cursor";
  dom.append(internalCursor);

  return {
    view: {
      contentDOM: { focus: contentFocusMock },
      focus: fallbackFocusMock,
      posAtCoords: vi.fn(() => pos),
      dispatch: dispatchMock,
      dom,
    },
    dispatchMock,
    contentFocusMock,
    fallbackFocusMock,
    internalCursor,
  };
}

describe("getOnCreateEditor", () => {
  beforeEach(() => {
    getStateMock.mockReset();
    getStateMock.mockReturnValue({ transform: [0, 0, 1] });
  });

  it("skips selection dispatch when pointer activation cannot resolve a position", () => {
    const { view, dispatchMock, contentFocusMock, fallbackFocusMock } =
      createView({ pos: null });

    const onCreateEditor = getOnCreateEditor({
      initialEvent: { clientX: 12, clientY: 18 },
      value: "mode",
      defaultVal: "Mode",
    });

    onCreateEditor(view);

    expect(contentFocusMock).toHaveBeenCalledWith({ preventScroll: true });
    expect(fallbackFocusMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("does not touch placeholder cursor height when zoom is 1", () => {
    const { view, internalCursor } = createView();
    const externalCursor = document.createElement("div");
    externalCursor.className = "cm-cursor";
    document.body.append(externalCursor);

    const onCreateEditor = getOnCreateEditor({
      initialEvent: "tab",
      value: "",
      defaultVal: "Mode",
    });

    onCreateEditor(view);

    expect(internalCursor.style.height).toBe("");
    expect(externalCursor.style.height).toBe("");

    externalCursor.remove();
  });

  it("scopes placeholder cursor sizing to the mounted editor when zoomed", () => {
    getStateMock.mockReturnValue({ transform: [0, 0, 2] });
    const { view, internalCursor } = createView();
    const externalCursor = document.createElement("div");
    externalCursor.className = "cm-cursor";
    document.body.append(externalCursor);

    const onCreateEditor = getOnCreateEditor({
      initialEvent: "tab",
      value: "",
      defaultVal: "Mode",
    });

    onCreateEditor(view);

    expect(internalCursor.style.height).toBe("28px");
    expect(externalCursor.style.height).toBe("");

    externalCursor.remove();
  });
});
