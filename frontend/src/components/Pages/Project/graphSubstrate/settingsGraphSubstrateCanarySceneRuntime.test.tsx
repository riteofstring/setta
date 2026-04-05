/* @vitest-environment jsdom */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useNodeInternals,
  useSectionElementSizeRegistry,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import { useSettingsGraphSubstrateCanarySceneRuntime } from "./settingsGraphSubstrateCanarySceneRuntime";
import type {
  SettingsGraphSubstrateCanarySceneSnapshot,
  SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneStore } from "./settingsGraphSubstrateCanarySceneStore";

function SceneRuntimeProbe({
  draggingSectionId,
  override,
  sections,
}: {
  draggingSectionId: string | null;
  override: SettingsGraphSubstrateCanarySectionPositionOverride;
  sections: Array<GraphSubstrateCanarySection>;
}) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const sceneSnapshot = useSettingsGraphSubstrateCanarySceneRuntime({
    draggingSectionId,
    sectionPositionOverride: override,
    sections,
  });

  return (
    <div
      data-testid="scene-runtime-probe"
      data-render-count={String(renderCountRef.current)}
      data-scene={JSON.stringify(serializeSceneSnapshot(sceneSnapshot))}
    />
  );
}

describe("useSettingsGraphSubstrateCanarySceneRuntime", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    useSectionElementSizeRegistry.getState().reset();
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
        <SceneRuntimeProbe
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

  it("seeds missing layout geometry from shared node internals until live measured size becomes available", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 120, y: 80 },
            width: 260,
            height: 180,
            zIndex: 2,
            tempZIndex: 2,
          },
        ],
      ]),
    });

    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[createSection()]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: {
          x: 120,
          y: 80,
          width: 260,
          height: 180,
        },
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            resolvedSize: { width: 260, height: 180 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: null,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(1);
    });

    // Once the local registry publishes a fresh measurement, it should take
    // over from the shared node-internals seed.
    act(() => {
      useSectionElementSizeRegistry.setState({
        "section-a": { width: 420, height: 315 },
      });
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: {
          x: 120,
          y: 80,
          width: 420,
          height: 315,
        },
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            resolvedSize: { width: 420, height: 315 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: null,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(2);
    });
  });

  it("keeps unlocked layout size authoritative and does not resubscribe to measured-size churn when layout geometry already exists", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
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

    act(() => {
      useSectionElementSizeRegistry.setState({
        "section-a": { width: 280, height: 190 },
      });
    });
    await act(async () => {});

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
    expect(readSceneRenderCount(host)).toBe(1);
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

  it("does not resubscribe locked sections with authoritative layout size to measured-size churn", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 160,
              positionAndSizeLocked: true,
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
            positionAndSizeLocked: true,
            renderedPosition: { x: 120, y: 80 },
            resolvedSize: { width: 240, height: 160 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 240,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(1);
    });

    act(() => {
      useSectionElementSizeRegistry.setState({
        "section-a": { width: 360, height: 210 },
      });
    });
    await act(async () => {});

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
          positionAndSizeLocked: true,
          renderedPosition: { x: 120, y: 80 },
          resolvedSize: { width: 240, height: 160 },
          sectionId: "section-a",
          tempZIndex: 2,
          width: 240,
          zIndex: 2,
        },
      ],
    });
    expect(readSceneRenderCount(host)).toBe(1);
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

  it("still uses the measured-size fallback for locked sections whose layout geometry is missing", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              positionAndSizeLocked: true,
            }),
          ]}
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
            positionAndSizeLocked: true,
            renderedPosition: { x: 120, y: 80 },
            resolvedSize: { width: 280, height: 190 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: null,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(2);
    });

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

  it("keeps the last shared section size when local measurement disappears from a still-mounted canary section", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
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

    act(() => {
      useSectionElementSizeRegistry.getState().reset();
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

  it("drops the carried-forward scene bounds once the section leaves the active canary scene", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
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
      expect(readSceneSnapshot(host).sceneBounds).toEqual({
        x: 120,
        y: 80,
        width: 280,
        height: 190,
      });
    });

    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: null,
        sections: [],
      });
    });
  });

  it("keeps layout position authoritative while applying transient drag overrides to the shared scene snapshot", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
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
        <SceneRuntimeProbe
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
        <SceneRuntimeProbe
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
        <SceneRuntimeProbe
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
        <SceneRuntimeProbe
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

  it("resets the shared scene snapshot when the runtime unmounts", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
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
      expect(
        useSettingsGraphSubstrateCanarySceneStore.getState().sceneSnapshot
          .sections,
      ).toHaveLength(1);
    });

    await act(async () => {
      root.unmount();
    });

    expect(
      useSettingsGraphSubstrateCanarySceneStore.getState().sceneSnapshot,
    ).toEqual({
      sceneBounds: null,
      sections: [],
      sectionsById: new Map(),
    });

    root = createRoot(host);
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
  const probe = hostElement.querySelector(
    '[data-testid="scene-runtime-probe"]',
  );
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected scene runtime probe.");
  }
  const sceneAttribute = probe.getAttribute("data-scene");
  if (!sceneAttribute) {
    throw new Error("Expected scene snapshot attribute.");
  }
  return JSON.parse(sceneAttribute) as ReturnType<
    typeof serializeSceneSnapshot
  >;
}

function readSceneRenderCount(hostElement: HTMLDivElement) {
  const probe = hostElement.querySelector(
    '[data-testid="scene-runtime-probe"]',
  );
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected scene runtime probe.");
  }

  const renderCount = probe.getAttribute("data-render-count");
  if (!renderCount) {
    throw new Error("Expected scene render count attribute.");
  }

  return Number(renderCount);
}
