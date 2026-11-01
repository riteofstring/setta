/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import { setWorkspaceColorMode } from "./appearance.js";
import { createNodesMapFromDocumentChildren } from "./nodeProjection.js";
import {
  getNodeInternalsStore,
  getWorkspaceAppearanceStore,
  getWorkspaceDocumentStore,
  type WorkspaceColorMode,
  type WorkspaceDocumentState,
} from "./stores.js";

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

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
        overflowMode: false,
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    parentSectionMap: {},
    savedViews: null,
  };
}

function seedStyledNode(host: WorkspaceHost) {
  const documentState = makeStyledDocument();
  getWorkspaceDocumentStore(host).setState(documentState);
  getNodeInternalsStore(host).setState({
    x: createNodesMapFromDocumentChildren(host, documentState, new Map()),
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
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
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

let host: WorkspaceHost;

afterEach(() => {
  host.dispose();
  restoreMatchMedia();
});

describe("setWorkspaceColorMode", () => {
  it("resolves explicit modes and reprojects styled node backgrounds", () => {
    host = createWorkspaceHost();
    seedStyledNode(host);
    const projectedNode = getNodeInternalsStore(host).getState().x.get("leaf");
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
    getNodeInternalsStore(host).setState({ x: new Map([["leaf", liveNode]]) });

    expect(liveNode.style).toEqual({
      background: "#e7f0fe",
    });

    setWorkspaceColorMode(host, "dark");
    expect(getWorkspaceAppearanceStore(host).getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
    const darkNode = getNodeInternalsStore(host).getState().x.get("leaf");
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

    setWorkspaceColorMode(host, "light");
    expect(getWorkspaceAppearanceStore(host).getState()).toMatchObject({
      colorMode: "light",
      darkMode: false,
    });
  });

  it("tracks system preference changes until an explicit mode replaces them", () => {
    host = createWorkspaceHost();
    const media = installMatchMedia(false);

    setWorkspaceColorMode(host, "system");
    expect(media.matchMedia).toHaveBeenCalledWith(
      "(prefers-color-scheme: dark)",
    );
    expect(media.listenerCount()).toBe(1);
    expect(getWorkspaceAppearanceStore(host).getState()).toMatchObject({
      colorMode: "system",
      darkMode: false,
    });

    media.emit(true);
    expect(getWorkspaceAppearanceStore(host).getState().darkMode).toBe(true);

    setWorkspaceColorMode(host, "light");
    expect(media.listenerCount()).toBe(0);
    media.emit(true);
    expect(getWorkspaceAppearanceStore(host).getState().darkMode).toBe(false);
  });

  it("fails specifically when system mode has no browser media-query API", () => {
    host = createWorkspaceHost();
    setWorkspaceColorMode(host, "dark");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
    expect(() => setWorkspaceColorMode(host, "system")).toThrowError(
      /requires window\.matchMedia/,
    );
    expect(getWorkspaceAppearanceStore(host).getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
  });

  it("fails specifically when media-query change events are unavailable", () => {
    host = createWorkspaceHost();
    setWorkspaceColorMode(host, "dark");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
    expect(() => setWorkspaceColorMode(host, "system")).toThrowError(
      /change-event support/,
    );
    expect(getWorkspaceAppearanceStore(host).getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
  });

  it("rejects unknown JavaScript inputs without disturbing the current mode", () => {
    host = createWorkspaceHost();
    setWorkspaceColorMode(host, "dark");
    expect(() =>
      setWorkspaceColorMode(host, "sepia" as WorkspaceColorMode),
    ).toThrowError(/Unknown workspace color mode: sepia/);
    expect(getWorkspaceAppearanceStore(host).getState()).toMatchObject({
      colorMode: "dark",
      darkMode: true,
    });
  });
});
