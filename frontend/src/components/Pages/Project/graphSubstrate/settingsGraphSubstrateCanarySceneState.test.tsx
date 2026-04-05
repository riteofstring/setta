/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySectionPositionOverride } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneState } from "./settingsGraphSubstrateCanarySceneState";
import { useSettingsGraphSubstrateCanarySceneStore } from "./settingsGraphSubstrateCanarySceneStore";

function SceneStateProbe({
  draggingSectionId,
  override,
}: {
  draggingSectionId: string | null;
  override: SettingsGraphSubstrateCanarySectionPositionOverride;
}) {
  const {
    draggingSectionId: currentDraggingSectionId,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  } = useSettingsGraphSubstrateCanarySceneState();

  useEffect(() => {
    setDraggingSectionId(draggingSectionId);
  }, [draggingSectionId, setDraggingSectionId]);

  useEffect(() => {
    setSectionPositionOverride(override);
  }, [override, setSectionPositionOverride]);

  return (
    <div
      data-testid="scene-state-probe"
      data-state={JSON.stringify({
        draggingSectionId: currentDraggingSectionId,
        override: sectionPositionOverride,
      })}
    />
  );
}

describe("useSettingsGraphSubstrateCanarySceneState", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("tracks transient drag state and position overrides locally", async () => {
    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={"section-a"}
          override={{
            sectionId: "section-a",
            position: { x: 460, y: 260 },
          }}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneState(host)).toEqual({
        draggingSectionId: "section-a",
        override: {
          sectionId: "section-a",
          position: { x: 460, y: 260 },
        },
      });
    });
    expect(
      useSettingsGraphSubstrateCanarySceneStore.getState().sceneSnapshot,
    ).toEqual({
      sceneBounds: null,
      sections: [],
      sectionsById: new Map(),
    });
    expect(useNodeInternals.getState().x.size).toBe(0);
  });

  it("keeps the transient local state isolated from canary section updates", async () => {
    await act(async () => {
      root.render(<SceneStateProbe draggingSectionId={null} override={null} />);
    });

    await vi.waitFor(() => {
      expect(readSceneState(host)).toEqual({
        draggingSectionId: null,
        override: null,
      });
    });

    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={"section-b"}
          override={{
            sectionId: "section-b",
            position: { x: 120, y: 80 },
          }}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneState(host)).toEqual({
        draggingSectionId: "section-b",
        override: {
          sectionId: "section-b",
          position: { x: 120, y: 80 },
        },
      });
    });
  });
});

function readSceneState(hostElement: HTMLDivElement) {
  const probe = hostElement.querySelector('[data-testid="scene-state-probe"]');
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected scene state probe.");
  }
  const stateAttribute = probe.getAttribute("data-state");
  if (!stateAttribute) {
    throw new Error("Expected scene state attribute.");
  }
  return JSON.parse(stateAttribute) as {
    draggingSectionId: string | null;
    override: SettingsGraphSubstrateCanarySectionPositionOverride;
  };
}
