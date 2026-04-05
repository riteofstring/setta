/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useNodeInternals,
  useSectionElementSizeRegistry,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type {
  SettingsGraphSubstrateCanarySceneSnapshot,
  SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
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
  const { sceneSnapshot, setDraggingSectionId, setSectionPositionOverride } =
    useSettingsGraphSubstrateCanarySceneState(sections);

  useEffect(() => {
    setDraggingSectionId(draggingSectionId);
  }, [draggingSectionId, setDraggingSectionId]);

  useEffect(() => {
    setSectionPositionOverride(override);
  }, [override, setSectionPositionOverride]);

  return (
    <div
      data-testid="scene-state-probe"
      data-scene={JSON.stringify(serializeSceneSnapshot(sceneSnapshot))}
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

  it("drives resolved size and node-internals sync from the same scene snapshot", async () => {
    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={null}
          sections={[createSection()]}
        />,
      );
    });

    act(() => {
      useSectionElementSizeRegistry.setState({
        "section-a": { width: 280, height: 190 },
      });
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: {
          x: 120,
          y: 80,
          width: 280,
          height: 190,
        },
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            resolvedSize: { width: 280, height: 190 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: null,
            zIndex: 2,
          },
        ],
      });
    });
    expect(
      serializeSceneSnapshot(
        useSettingsGraphSubstrateCanarySceneStore.getState().sceneSnapshot,
      ),
    ).toEqual(readSceneSnapshot(host));

    await vi.waitFor(() => {
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: 190,
        id: "section-a",
        position: { x: 120, y: 80 },
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: 280,
        zIndex: 2,
      });
    });
  });

  it("keeps layout position authoritative while applying transient drag overrides to the shared scene snapshot", async () => {
    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 160,
              width: 240,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: {
          x: 120,
          y: 80,
          width: 240,
          height: 160,
        },
        sections: [
          {
            height: 160,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            resolvedSize: { width: 240, height: 160 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 240,
            zIndex: 2,
          },
        ],
      });
    });

    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={{
            sectionId: "section-a",
            position: { x: 460, y: 260 },
          }}
          sections={[
            createSection({
              height: 160,
              width: 240,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: {
          x: 460,
          y: 260,
          width: 240,
          height: 160,
        },
        sections: [
          {
            height: 160,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 460, y: 260 },
            resolvedSize: { width: 240, height: 160 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 240,
            zIndex: 2,
          },
        ],
      });
    });

    expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual({
      x: 460,
      y: 260,
    });
  });

  it("raises and resets the active drag section temp z-index from the shared scene snapshot", async () => {
    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 160,
              width: 240,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: 160,
        id: "section-a",
        position: { x: 120, y: 80 },
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: 240,
        zIndex: 2,
      });
    });

    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={"section-a"}
          override={null}
          sections={[
            createSection({
              height: 160,
              width: 240,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host).sections[0]?.tempZIndex).toBe(1002);
      expect(useNodeInternals.getState().x.get("section-a")?.tempZIndex).toBe(
        1002,
      );
    });

    await act(async () => {
      root.render(
        <SceneStateProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 160,
              width: 240,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host).sections[0]?.tempZIndex).toBe(2);
      expect(useNodeInternals.getState().x.get("section-a")?.tempZIndex).toBe(
        2,
      );
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

function serializeSceneSnapshot(
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot,
) {
  return {
    sceneBounds: sceneSnapshot.sceneBounds,
    sections: sceneSnapshot.sections.map((section) => {
      return {
        height: section.height,
        position: section.position,
        positionAndSizeLocked: section.positionAndSizeLocked,
        renderedPosition: section.renderedPosition,
        resolvedSize: section.resolvedSize,
        sectionId: section.sectionId,
        tempZIndex: section.tempZIndex,
        width: section.width,
        zIndex: section.zIndex,
      };
    }),
  };
}

function readSceneSnapshot(hostElement: HTMLDivElement) {
  const probe = hostElement.querySelector('[data-testid="scene-state-probe"]');
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected scene state probe.");
  }
  const sceneAttribute = probe.getAttribute("data-scene");
  if (!sceneAttribute) {
    throw new Error("Expected scene snapshot attribute.");
  }
  return JSON.parse(sceneAttribute) as ReturnType<
    typeof serializeSceneSnapshot
  >;
}
