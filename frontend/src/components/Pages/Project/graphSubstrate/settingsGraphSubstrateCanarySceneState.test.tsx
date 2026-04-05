/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type { SettingsGraphSubstrateCanarySectionPositionOverride } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneState } from "./settingsGraphSubstrateCanarySceneState";
import { useSettingsGraphSubstrateCanarySceneStore } from "./settingsGraphSubstrateCanarySceneStore";

function SceneStateProbe({
  draggingSectionId,
  override,
  sections,
}: {
  draggingSectionId: string | null;
  override: SettingsGraphSubstrateCanarySectionPositionOverride;
  sections: Array<GraphSubstrateCanarySection>;
}) {
  const {
    draggingSectionId: currentDraggingSectionId,
    sectionById,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  } = useSettingsGraphSubstrateCanarySceneState(sections);

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
        sectionIds: Array.from(sectionById.keys()),
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
          sections={[createSection()]}
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
        sectionIds: ["section-a"],
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

  it("rebuilds the section lookup map when the canary sections change", async () => {
    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={null}
          sections={[createSection()]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneState(host).sectionIds).toEqual(["section-a"]);
    });

    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              sectionId: "section-b",
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneState(host)).toEqual({
        draggingSectionId: null,
        override: null,
        sectionIds: ["section-b"],
      });
    });
  });
});

function createSection(
  overrides: Partial<GraphSubstrateCanarySection> = {},
): GraphSubstrateCanarySection {
  return {
    sectionId: "section-a",
    position: { x: 120, y: 80 },
    zIndex: 2,
    tempZIndex: 2,
    width: null,
    height: null,
    positionAndSizeLocked: false,
    ...overrides,
  };
}

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
    sectionIds: Array<string>;
  };
}
