/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveDictAreaPixiManagedSceneLocalBounds,
  LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES,
  LiveDictAreaPixiPageRuntimeBoundary,
  LiveDictAreaPixiPageRuntimeHost,
  type LiveDictAreaPixiRegisteredScene,
  useOptionalLiveDictAreaPixiPageRuntime,
} from "./LiveDictAreaPixiPageRuntime";

vi.hoisted(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }

  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = vi.fn();
});

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { transform: [number, number, number] }) => unknown,
  ) => selector({ transform: [0, 0, 1] }),
}));

vi.mock("state/definitions", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocalStorage: (selector: (state: { darkMode: boolean }) => unknown) =>
      selector({ darkMode: false }),
  };
});

vi.mock("pixi.js", () => {
  class MockApplication {
    canvas = document.createElement("canvas");
    renderer = {
      resize: vi.fn(),
    };
    stage = {
      children: [] as Array<{ destroy: () => void }>,
      eventMode: "auto",
      interactiveChildren: true,
      addChild: (child: { destroy: () => void }) => {
        this.stage.children.push(child);
        return child;
      },
      removeChildren: () => {
        const children = [...this.stage.children];
        this.stage.children = [];
        return children;
      },
    };

    async init() {}

    destroy() {}

    render() {}
  }

  class MockContainer {
    children: Array<{ destroy: () => void }> = [];
    mask: unknown = null;
    scale = { x: 1, y: 1 };
    x = 0;
    y = 0;

    addChild(child: { destroy: () => void }) {
      this.children.push(child);
      return child;
    }

    destroy() {}
  }

  class MockGraphics {
    addChild(child: { destroy: () => void }) {
      return child;
    }

    circle() {
      return this;
    }

    destroy() {}

    fill() {
      return this;
    }

    roundRect() {
      return this;
    }

    stroke() {
      return this;
    }
  }

  class MockText {
    text: string;

    constructor({ text }: { text: string }) {
      this.text = text;
    }

    destroy() {}

    get width() {
      return this.text.length * 6;
    }
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
  };
});

function RuntimeProbe() {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();
  const firstScene = runtime?.registeredScenes[0] ?? null;
  const lostScene = runtime?.contextLostScene ?? null;

  return (
    <div
      data-live-dict-area-pixi-runtime-probe="true"
      data-live-dict-area-pixi-runtime-context-lost={
        runtime?.contextLost ? "true" : "false"
      }
      data-live-dict-area-pixi-runtime-count={
        runtime?.registeredSceneCount ?? -1
      }
      data-live-dict-area-pixi-runtime-dom-context-lost-scene-names={
        runtime?.registeredScenes
          .filter((scene) => scene.renderMode === "dom-context-lost")
          .map((scene) => scene.sectionName ?? "")
          .filter((sectionName) => sectionName.length > 0)
          .join(",") ?? ""
      }
      data-live-dict-area-pixi-runtime-dom-context-lost-scenes={
        runtime?.registeredScenes
          .filter((scene) => scene.renderMode === "dom-context-lost")
          .map((scene) => scene.sectionId ?? "")
          .filter((sectionId) => sectionId.length > 0)
          .join(",") ?? ""
      }
      data-live-dict-area-pixi-runtime-lost-scene={
        runtime?.contextLostScene?.sectionId ?? ""
      }
      data-live-dict-area-pixi-runtime-lost-scene-bounds={
        lostScene?.bounds
          ? `${lostScene.bounds.left},${lostScene.bounds.top},${lostScene.bounds.width},${lostScene.bounds.height}`
          : ""
      }
      data-live-dict-area-pixi-runtime-render-modes={
        runtime?.registeredScenes
          .map((scene) => `${scene.sectionId ?? ""}:${scene.renderMode}`)
          .join(",") ?? ""
      }
      data-live-dict-area-pixi-runtime-scenes={
        runtime?.registeredScenes
          .map((scene) => scene.sectionId ?? "")
          .join(",") ?? ""
      }
      data-live-dict-area-pixi-runtime-summary={
        firstScene?.summary
          ? `${firstScene.summary.blockCount}:${firstScene.summary.readableRowCount}:${firstScene.summary.totalRowCount}:${firstScene.summary.valuePreviewCount}`
          : ""
      }
      data-live-dict-area-pixi-runtime-visible-bounds={
        firstScene?.bounds
          ? `${firstScene.bounds.left},${firstScene.bounds.top},${firstScene.bounds.width},${firstScene.bounds.height}`
          : ""
      }
    />
  );
}

function SceneRegistration({
  bounds = null,
  layout = null,
  renderMode = "pixi",
  runtimeSceneId,
  sceneBoundary = null,
  sectionId,
  sectionName = sectionId,
  styleSourceElement = null,
  summary = null,
}: {
  bounds?: { height: number; left: number; top: number; width: number } | null;
  layout?: LiveDictAreaPixiRegisteredScene["layout"];
  renderMode?: "dom-context-lost" | "pixi";
  runtimeSceneId: string;
  sceneBoundary?: LiveDictAreaPixiRegisteredScene["sceneBoundary"];
  sectionId: string;
  sectionName?: string | null;
  styleSourceElement?: HTMLElement | null;
  summary?: {
    blockCount: number;
    readableRowCount: number;
    totalRowCount: number;
    valuePreviewCount: number;
  } | null;
}) {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();
  const registerScene = runtime?.registerScene;

  useEffect(() => {
    if (!registerScene) {
      return;
    }

    return registerScene({
      bounds,
      layout,
      renderMode,
      runtimeSceneId,
      sceneBoundary,
      sectionId,
      sectionName,
      styleSourceElement,
      summary,
    });
  }, [
    bounds,
    layout,
    registerScene,
    renderMode,
    runtimeSceneId,
    sceneBoundary,
    sectionId,
    sectionName,
    styleSourceElement,
    summary,
  ]);

  return null;
}

function ContextLossButton({
  runtimeSceneId,
  sectionId,
}: {
  runtimeSceneId: string;
  sectionId: string;
}) {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();

  return (
    <button
      data-live-dict-area-pixi-runtime-trigger={sectionId}
      onClick={() => {
        runtime?.reportContextLost({
          runtimeSceneId,
          sectionId,
        });
      }}
      type="button"
    />
  );
}

describe("getLiveDictAreaPixiManagedSceneLocalBounds", () => {
  it("keeps managed scene bounds in host screen space when the visible scene rect is clipped at low zoom", () => {
    const host = document.createElement("div");
    host.getBoundingClientRect = vi.fn(() => ({
      bottom: 400,
      height: 300,
      left: 100,
      right: 500,
      top: 80,
      width: 400,
      x: 100,
      y: 80,
      toJSON: () => "",
    })) as typeof host.getBoundingClientRect;

    expect(
      getLiveDictAreaPixiManagedSceneLocalBounds({
        host,
        sceneBounds: {
          height: 35,
          left: 140,
          logicalHeight: 140,
          logicalWidth: 260,
          top: 100,
          width: 55,
        },
        viewportZoom: 0.25,
      }),
    ).toEqual({
      height: 35,
      left: 40,
      top: 20,
      width: 55,
    });
  });

  it("preserves fractional screen-space offsets so low-zoom shared-runtime scenes do not drift vertically", () => {
    const host = document.createElement("div");
    host.getBoundingClientRect = vi.fn(() => ({
      bottom: 380.1,
      height: 300,
      left: 100.2,
      right: 500.2,
      top: 80.1,
      width: 400,
      x: 100.2,
      y: 80.1,
      toJSON: () => "",
    })) as typeof host.getBoundingClientRect;

    expect(
      getLiveDictAreaPixiManagedSceneLocalBounds({
        host,
        sceneBounds: {
          height: 35.2,
          left: 140.6,
          logicalHeight: 140,
          logicalWidth: 260,
          top: 100.4,
          width: 55.2,
        },
        viewportZoom: 0.25,
      }),
    ).toEqual({
      height: 35.2,
      left: 40.4,
      top: 20.3,
      width: 55.2,
    });
  });
});

describe("LiveDictAreaPixiPageRuntimeBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("tracks registered live Pixi scenes, their metadata, and the shared runtime host", () => {
    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiPageRuntimeHost />
          <RuntimeProbe />
          <SceneRegistration
            bounds={{ height: 180, left: 12, top: 34, width: 320 }}
            renderMode="pixi"
            runtimeSceneId="scene-1"
            sectionId="section-1"
            summary={{
              blockCount: 3,
              readableRowCount: 7,
              totalRowCount: 9,
              valuePreviewCount: 5,
            }}
          />
          <SceneRegistration
            bounds={{ height: 120, left: 400, top: 20, width: 280 }}
            renderMode="dom-context-lost"
            runtimeSceneId="scene-2"
            sectionId="section-2"
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    const probe = container.querySelector(
      "[data-live-dict-area-pixi-runtime-probe='true']",
    );
    const host = container.querySelector(
      "[data-live-dict-area-pixi-page-runtime-host='true']",
    );
    expect(host).not.toBeNull();
    expect(host?.className).toContain("z-0");
    expect(
      host?.getAttribute("data-live-dict-area-pixi-runtime-pixi-count"),
    ).toBe("1");
    expect(
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-dom-context-lost-count",
      ),
    ).toBe("1");
    expect(
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-dom-context-lost-scenes",
      ),
    ).toBe("section-2");
    expect(
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-dom-context-lost-scene-names",
      ),
    ).toBe("section-2");
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-count")).toBe(
      "2",
    );
    expect(
      probe?.getAttribute(
        "data-live-dict-area-pixi-runtime-dom-context-lost-scenes",
      ),
    ).toBe("section-2");
    expect(
      probe?.getAttribute(
        "data-live-dict-area-pixi-runtime-dom-context-lost-scene-names",
      ),
    ).toBe("section-2");
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-scenes")).toBe(
      "section-1,section-2",
    );
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-render-modes"),
    ).toBe("section-1:pixi,section-2:dom-context-lost");
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-visible-bounds"),
    ).toBe("12,34,320,180");
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-summary"),
    ).toBe("3:7:9:5");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiPageRuntimeHost />
          <RuntimeProbe />
          <SceneRegistration
            bounds={{ height: 210, left: 24, top: 40, width: 300 }}
            renderMode="pixi"
            runtimeSceneId="scene-1"
            sectionId="section-1"
            summary={{
              blockCount: 4,
              readableRowCount: 8,
              totalRowCount: 10,
              valuePreviewCount: 6,
            }}
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-count")).toBe(
      "1",
    );
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-scenes")).toBe(
      "section-1",
    );
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-visible-bounds"),
    ).toBe("24,40,300,210");
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-summary"),
    ).toBe("4:8:10:6");
  });

  it("tracks every renderable shared-runtime scene instead of trimming to the historical canary names", () => {
    const styleSourceElement = document.createElement("div");
    const emptyLayout = {
      blocks: [],
      canvasHeight: 0,
      canvasWidth: 320,
      edgeStrip: null,
      paramAreas: [],
      readableRowCount: 0,
      totalRowCount: 0,
      valuePreviewCount: 0,
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiPageRuntimeHost />
          <SceneRegistration
            bounds={{ height: 180, left: 12, top: 34, width: 320 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-prompt"
            sectionId="section-prompt"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[0]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 120, left: 400, top: 20, width: 280 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-browser"
            sectionId="section-browser"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[1]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 140, left: 720, top: 24, width: 260 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-text-block"
            sectionId="section-text-block"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[2]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 132, left: 1000, top: 24, width: 300 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-code-param"
            sectionId="section-code-param"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[3]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 124, left: 1328, top: 24, width: 280 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-section-sizing-policy"
            sectionId="section-section-sizing-policy"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[4]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 116, left: 1640, top: 24, width: 260 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-button-param"
            sectionId="section-button-param"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[5]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 112, left: 1936, top: 24, width: 260 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-gen-python-metadata"
            sectionId="section-gen-python-metadata"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[6]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 110, left: 2232, top: 24, width: 240 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-draw"
            sectionId="section-draw"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[7]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 108, left: 2504, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-iframe"
            sectionId="section-iframe"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[8]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 102, left: 2756, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-backend"
            sectionId="section-backend"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[9]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 100, left: 3008, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-state-machine-gate"
            sectionId="section-state-machine-gate"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[10]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 98, left: 3260, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-code-section"
            sectionId="section-code-section"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[11]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 100, left: 3512, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-chat-section"
            sectionId="section-chat-section"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[12]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 104, left: 3764, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-gen-python-code-section"
            sectionId="section-gen-python-code-section"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[13]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 108, left: 4016, top: 24, width: 224 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-global-variables-section"
            sectionId="section-global-variables-section"
            sectionName={
              LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES[14]
            }
            styleSourceElement={styleSourceElement}
          />
          <SceneRegistration
            bounds={{ height: 100, left: 4272, top: 24, width: 220 }}
            layout={emptyLayout}
            renderMode="pixi"
            runtimeSceneId="scene-other"
            sectionId="section-other"
            sectionName="otherSectionDefault"
            styleSourceElement={styleSourceElement}
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    const host = container.querySelector(
      "[data-live-dict-area-pixi-page-runtime-host='true']",
    );
    const managedSceneIds = (
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-managed-scene-ids",
      ) ?? ""
    )
      .split(",")
      .filter((sceneId) => sceneId.length > 0);
    const managedSceneNames = (
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-managed-scene-names",
      ) ?? ""
    )
      .split(",")
      .filter((sceneName) => sceneName.length > 0);

    expect(
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-managed-scene-count",
      ),
    ).toBe("16");
    expect(managedSceneIds).toHaveLength(16);
    expect(managedSceneIds).toContain("scene-other");
    expect(managedSceneNames).toHaveLength(16);
    expect(managedSceneNames).toEqual(
      expect.arrayContaining([
        ...LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES,
        "otherSectionDefault",
      ]),
    );
    expect(
      managedSceneNames.includes(
        host?.getAttribute(
          "data-live-dict-area-pixi-runtime-managed-scene-name",
        ) ?? "",
      ),
    ).toBe(true);
  });

  it("keeps one shared context-loss policy once any registered scene reports loss", () => {
    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <RuntimeProbe />
          <SceneRegistration
            bounds={{ height: 180, left: 12, top: 34, width: 320 }}
            runtimeSceneId="scene-1"
            sectionId="section-1"
          />
          <SceneRegistration
            bounds={{ height: 150, left: 360, top: 40, width: 200 }}
            runtimeSceneId="scene-2"
            sectionId="section-2"
          />
          <ContextLossButton runtimeSceneId="scene-1" sectionId="section-1" />
          <ContextLossButton runtimeSceneId="scene-2" sectionId="section-2" />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    const probe = container.querySelector(
      "[data-live-dict-area-pixi-runtime-probe='true']",
    );
    const firstLossButton = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-pixi-runtime-trigger='section-1']",
    );
    const secondLossButton = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-pixi-runtime-trigger='section-2']",
    );

    act(() => {
      firstLossButton?.click();
    });

    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-context-lost"),
    ).toBe("true");
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-lost-scene"),
    ).toBe("section-1");
    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-lost-scene-bounds"),
    ).toBe("12,34,320,180");

    act(() => {
      secondLossButton?.click();
    });

    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-lost-scene"),
    ).toBe("section-1");
  });
});
