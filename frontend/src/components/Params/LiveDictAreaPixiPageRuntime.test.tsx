/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LiveDictAreaPixiPageRuntimeBoundary,
  useOptionalLiveDictAreaPixiPageRuntime,
} from "./LiveDictAreaPixiPageRuntime";

function RuntimeProbe() {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();

  return (
    <div
      data-live-dict-area-pixi-runtime-context-lost={
        runtime?.contextLost ? "true" : "false"
      }
      data-live-dict-area-pixi-runtime-count={
        runtime?.registeredSceneCount ?? -1
      }
      data-live-dict-area-pixi-runtime-lost-scene={
        runtime?.contextLostScene?.sectionId ?? ""
      }
      data-live-dict-area-pixi-runtime-scenes={
        runtime?.registeredScenes
          .map((scene) => scene.sectionId ?? "")
          .join(",") ?? ""
      }
    />
  );
}

function SceneRegistration({
  runtimeSceneId,
  sectionId,
}: {
  runtimeSceneId: string;
  sectionId: string;
}) {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();
  const registerScene = runtime?.registerScene;

  useEffect(() => {
    if (!registerScene) {
      return;
    }

    return registerScene({
      runtimeSceneId,
      sectionId,
    });
  }, [registerScene, runtimeSceneId, sectionId]);

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

  it("tracks registered live Pixi scenes and unregisters them on rerender", () => {
    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <RuntimeProbe />
          <SceneRegistration runtimeSceneId="scene-1" sectionId="section-1" />
          <SceneRegistration runtimeSceneId="scene-2" sectionId="section-2" />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    const probe = container.querySelector(
      "[data-live-dict-area-pixi-runtime-count]",
    );
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-count")).toBe(
      "2",
    );
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-scenes")).toBe(
      "section-1,section-2",
    );

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <RuntimeProbe />
          <SceneRegistration runtimeSceneId="scene-2" sectionId="section-2" />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-count")).toBe(
      "1",
    );
    expect(probe?.getAttribute("data-live-dict-area-pixi-runtime-scenes")).toBe(
      "section-2",
    );
  });

  it("keeps one shared context-loss policy once any registered scene reports loss", () => {
    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <RuntimeProbe />
          <SceneRegistration runtimeSceneId="scene-1" sectionId="section-1" />
          <SceneRegistration runtimeSceneId="scene-2" sectionId="section-2" />
          <ContextLossButton runtimeSceneId="scene-1" sectionId="section-1" />
          <ContextLossButton runtimeSceneId="scene-2" sectionId="section-2" />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    const probe = container.querySelector(
      "[data-live-dict-area-pixi-runtime-context-lost]",
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

    act(() => {
      secondLossButton?.click();
    });

    expect(
      probe?.getAttribute("data-live-dict-area-pixi-runtime-lost-scene"),
    ).toBe("section-1");
  });
});
