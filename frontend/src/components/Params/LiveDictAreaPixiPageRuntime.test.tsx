/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

  it("tracks every prioritized shared-runtime managed scene without dropping the first canary", () => {
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
            bounds={{ height: 110, left: 1936, top: 24, width: 220 }}
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
    expect(
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-managed-scene-count",
      ),
    ).toBe("6");
    expect(
      host?.getAttribute("data-live-dict-area-pixi-runtime-managed-scene-ids"),
    ).toBe(
      "scene-prompt,scene-browser,scene-text-block,scene-code-param,scene-section-sizing-policy,scene-button-param",
    );
    expect(
      host?.getAttribute(
        "data-live-dict-area-pixi-runtime-managed-scene-names",
      ),
    ).toBe(
      "promptSectionDefault,browserSectionDefault,textBlockSectionDefault,codeParamCodeObjDefault,sectionSizingPolicy,buttonParamCodeObjDefault",
    );
    expect(
      host?.getAttribute("data-live-dict-area-pixi-runtime-managed-scene-name"),
    ).toBe("promptSectionDefault");
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
