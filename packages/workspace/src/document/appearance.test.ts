/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceColorMode } from "./appearance";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
  type WorkspaceColorMode,
  type WorkspaceDocumentState,
} from "./stores";

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

function makeStyledDocument(): WorkspaceDocumentState {
  return {
    sections: {
      leaf: {
        id: "leaf",
        kind: "leaf",
        name: "Leaf",
        size: { width: 224, height: 96 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: "#3b82f6",
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    parentSectionMap: {},
  };
}

function seedStyledNode() {
  const documentState = makeStyledDocument();
  useWorkspaceDocument.setState(documentState);
  useNodeInternals.setState({
    x: createNodesMapFromDocumentChildren(documentState, new Map()),
  });
}

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn(() => mediaQuery);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });
  return {
    emit(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches } as MediaQueryListEvent);
      }
    },
    listenerCount: () => listeners.size,
    matchMedia,
  };
}

function restoreMatchMedia() {
  if (originalMatchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
    return;
  }
  Reflect.deleteProperty(window, "matchMedia");
}

afterEach(() => {
  setWorkspaceColorMode("light");
  useWorkspaceAppearance.getState().reset();
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  restoreMatchMedia();
});

describe("setWorkspaceColorMode", () => {
  it("resolves explicit modes and reprojects styled node backgrounds", () => {
    seedStyledNode();
    const projectedNode = useNodeInternals.getState().x.get("leaf");
    if (!projectedNode) {
      throw new Error("The styled test node was not projected.");
    }
    const livePosition = { x: 47, y: 83 };
    const liveNode = {
      ...projectedNode,
      position: livePosition,
      width: 315,
      height: 127,
      tempZIndex: 1000,
    };
    useNodeInternals.setState({ x: new Map([["leaf", liveNode]]) });

    expect(liveNode.style).toEqual({
      background: "#e7f0fe",
    });

    setWorkspaceColorMode("dark");
    expect(useWorkspaceAppearance.getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
    const darkNode = useNodeInternals.getState().x.get("leaf");
    expect(darkNode?.style).toEqual({
      background: "#0b172c",
    });
    expect(darkNode).toMatchObject({
      position: { x: 47, y: 83 },
      width: 315,
      height: 127,
      tempZIndex: 1000,
    });
    expect(darkNode?.position).toBe(livePosition);

    setWorkspaceColorMode("light");
    expect(useWorkspaceAppearance.getState()).toMatchObject({
      colorMode: "light",
      darkMode: false,
    });
  });

  it("tracks system preference changes until an explicit mode replaces them", () => {
    const media = installMatchMedia(false);

    setWorkspaceColorMode("system");
    expect(media.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(media.listenerCount()).toBe(1);
    expect(useWorkspaceAppearance.getState()).toMatchObject({
      colorMode: "system",
      darkMode: false,
    });

    media.emit(true);
    expect(useWorkspaceAppearance.getState().darkMode).toBe(true);

    setWorkspaceColorMode("light");
    expect(media.listenerCount()).toBe(0);
    media.emit(true);
    expect(useWorkspaceAppearance.getState().darkMode).toBe(false);
  });

  it("fails specifically when system mode has no browser media-query API", () => {
    setWorkspaceColorMode("dark");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    expect(() => setWorkspaceColorMode("system")).toThrowError(/requires window\.matchMedia/);
    expect(useWorkspaceAppearance.getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
  });

  it("fails specifically when media-query change events are unavailable", () => {
    setWorkspaceColorMode("dark");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
    expect(() => setWorkspaceColorMode("system")).toThrowError(/change-event support/);
    expect(useWorkspaceAppearance.getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
  });

  it("rejects unknown JavaScript inputs without disturbing the current mode", () => {
    setWorkspaceColorMode("dark");
    expect(() => setWorkspaceColorMode("sepia" as WorkspaceColorMode)).toThrowError(
      /Unknown workspace color mode: sepia/,
    );
    expect(useWorkspaceAppearance.getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
  });
});
