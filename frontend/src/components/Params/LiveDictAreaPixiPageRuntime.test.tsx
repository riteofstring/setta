/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LiveDictAreaPixiPageRuntimeBoundary,
  LiveDictAreaPixiPageRuntimeHost,
  useOptionalLiveDictAreaPixiPageRuntime,
} from "./LiveDictAreaPixiPageRuntime";

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
  renderMode = "pixi",
  runtimeSceneId,
  sectionId,
  summary = null,
}: {
  bounds?: { height: number; left: number; top: number; width: number } | null;
  renderMode?: "dom-context-lost" | "pixi";
  runtimeSceneId: string;
  sectionId: string;
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
      renderMode,
      runtimeSceneId,
      sectionId,
      summary,
    });
  }, [bounds, registerScene, renderMode, runtimeSceneId, sectionId, summary]);

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
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-count")).toBe(
      "2",
    );
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
