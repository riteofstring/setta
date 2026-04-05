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

  it("keeps measured fallback local while syncing scene position and z-index without promoting scene bounds", async () => {
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
        sceneBounds: null,
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
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
    expect(
      useSettingsGraphSubstrateCanarySceneStore.getState().sectionSeedNodes
        .size,
    ).toBe(0);

    await vi.waitFor(() => {
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: null,
        id: "section-a",
        position: { x: 120, y: 80 },
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: null,
        zIndex: 2,
      });
    });
  });

  it("bootstraps the shared-node seed cache from measured size without promoting that fallback into node internals", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[createSection({ sizeAuthority: "sharedNode" })]}
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
        sceneBounds: null,
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: null,
            zIndex: 2,
          },
        ],
      });
      expect(
        useSettingsGraphSubstrateCanarySceneStore
          .getState()
          .sectionSeedNodes.get("section-a"),
      ).toEqual({
        width: 280,
        height: 190,
        sizeAuthority: "sharedNode",
      });
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: null,
        id: "section-a",
        position: { x: 120, y: 80 },
        sizeAuthority: "sharedNode",
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: null,
        zIndex: 2,
      });
    });
  });

  it("keeps shared-node geometry authoritative and does not resubscribe to measured-size churn", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 180,
              sizeAuthority: "sharedNode",
              width: 260,
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
          width: 260,
          height: 180,
        },
        sections: [
          {
            height: 180,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 260,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(1);
      expect(
        useSettingsGraphSubstrateCanarySceneStore
          .getState()
          .sectionSeedNodes.get("section-a"),
      ).toEqual({
        width: 260,
        height: 180,
        sizeAuthority: "sharedNode",
      });
    });

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
          width: 260,
          height: 180,
        },
        sections: [
          {
            height: 180,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 260,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(1);
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: 180,
        id: "section-a",
        position: { x: 120, y: 80 },
        sizeAuthority: "sharedNode",
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: 260,
        zIndex: 2,
      });
      expect(
        useSettingsGraphSubstrateCanarySceneStore
          .getState()
          .sectionSeedNodes.get("section-a"),
      ).toEqual({
        width: 260,
        height: 180,
        sizeAuthority: "sharedNode",
      });
    });
  });

  it("keeps section-model size authoritative and does not resubscribe to measured-size churn when model geometry already exists", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 78,
              sizeAuthority: "sectionModel",
              width: 550,
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
          width: 550,
          height: 78,
        },
        sections: [
          {
            height: 78,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 550,
            zIndex: 2,
          },
        ],
      });
      expect(readSceneRenderCount(host)).toBe(1);
    });

    expect(useNodeInternals.getState().x.get("section-a")).toEqual({
      height: 78,
      id: "section-a",
      position: { x: 120, y: 80 },
      sizeAuthority: "sectionModel",
      style: undefined,
      tempZIndex: 2,
      type: undefined,
      width: 550,
      zIndex: 2,
    });

    act(() => {
      useSectionElementSizeRegistry.setState({
        "section-a": { width: 620, height: 210 },
      });
    });
    await act(async () => {});

    expect(readSceneSnapshot(host)).toEqual({
      sceneBounds: {
        x: 120,
        y: 80,
        width: 550,
        height: 78,
      },
      sections: [
        {
          height: 78,
          position: { x: 120, y: 80 },
          positionAndSizeLocked: false,
          renderedPosition: { x: 120, y: 80 },
          sectionId: "section-a",
          tempZIndex: 2,
          width: 550,
          zIndex: 2,
        },
      ],
    });
    expect(readSceneRenderCount(host)).toBe(1);
    expect(useNodeInternals.getState().x.get("section-a")).toEqual({
      height: 78,
      id: "section-a",
      position: { x: 120, y: 80 },
      sizeAuthority: "sectionModel",
      style: undefined,
      tempZIndex: 2,
      type: undefined,
      width: 550,
      zIndex: 2,
    });
  });

  it("drops the canary-local shared-node seed once section-model geometry becomes authoritative", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 180,
              sizeAuthority: "sharedNode",
              width: 260,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(
        useSettingsGraphSubstrateCanarySceneStore
          .getState()
          .sectionSeedNodes.get("section-a"),
      ).toEqual({
        width: 260,
        height: 180,
        sizeAuthority: "sharedNode",
      });
    });

    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 78,
              sizeAuthority: "sectionModel",
              width: 550,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      const state = useSettingsGraphSubstrateCanarySceneStore.getState();
      expect(state.sectionSeedNodes.has("section-a")).toBe(false);
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: 78,
        id: "section-a",
        position: { x: 120, y: 80 },
        sizeAuthority: "sectionModel",
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: 550,
        zIndex: 2,
      });
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

  it("still uses the measured-size fallback for locked sections whose layout geometry is missing without promoting scene bounds", async () => {
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
        sceneBounds: null,
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: true,
            renderedPosition: { x: 120, y: 80 },
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
      height: null,
      id: "section-a",
      position: { x: 120, y: 80 },
      style: undefined,
      tempZIndex: 2,
      type: undefined,
      width: null,
      zIndex: 2,
    });
  });

  it("keeps the last shared section size after the controller refreshes the section from shared node state", async () => {
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
        height: null,
        id: "section-a",
        position: { x: 120, y: 80 },
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: null,
        zIndex: 2,
      });
    });

    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 190,
              sizeAuthority: "sharedNode",
              width: 280,
            }),
          ]}
        />,
      );
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
            height: 190,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: 280,
            zIndex: 2,
          },
        ],
      });
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: 190,
        id: "section-a",
        position: { x: 120, y: 80 },
        sizeAuthority: "sharedNode",
        tempZIndex: 2,
        width: 280,
        zIndex: 2,
      });
    });
  });

  it("keeps unresolved measured size local across controller refreshes", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[createSection({ sizeAuthority: "none" })]}
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
        height: null,
        id: "section-a",
        position: { x: 120, y: 80 },
        sizeAuthority: "none",
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: null,
        zIndex: 2,
      });
    });

    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[createSection({ sizeAuthority: "none" })]}
        />,
      );
    });

    act(() => {
      useSectionElementSizeRegistry.getState().reset();
    });

    await vi.waitFor(() => {
      expect(readSceneSnapshot(host)).toEqual({
        sceneBounds: null,
        sections: [
          {
            height: null,
            position: { x: 120, y: 80 },
            positionAndSizeLocked: false,
            renderedPosition: { x: 120, y: 80 },
            sectionId: "section-a",
            tempZIndex: 2,
            width: null,
            zIndex: 2,
          },
        ],
      });
      expect(useNodeInternals.getState().x.get("section-a")).toEqual({
        height: null,
        id: "section-a",
        position: { x: 120, y: 80 },
        sizeAuthority: "none",
        style: undefined,
        tempZIndex: 2,
        type: undefined,
        width: null,
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
      expect(readSceneSnapshot(host).sceneBounds).toEqual({
        x: 120,
        y: 80,
        width: 240,
        height: 160,
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

  it("resets the shared scene snapshot but keeps the canary-local shared-node seed cache when the runtime unmounts", async () => {
    await act(async () => {
      root.render(
        <SceneRuntimeProbe
          draggingSectionId={null}
          override={null}
          sections={[
            createSection({
              height: 160,
              sizeAuthority: "sharedNode",
              width: 240,
            }),
          ]}
        />,
      );
    });

    await vi.waitFor(() => {
      const state = useSettingsGraphSubstrateCanarySceneStore.getState();
      expect(state.sceneSnapshot.sections).toHaveLength(1);
      expect(state.sectionSeedNodes.get("section-a")).toEqual({
        width: 240,
        height: 160,
        sizeAuthority: "sharedNode",
      });
    });

    await act(async () => {
      root.unmount();
    });

    const stateAfterUnmount =
      useSettingsGraphSubstrateCanarySceneStore.getState();
    expect(stateAfterUnmount.sceneSnapshot).toEqual({
      sceneBounds: null,
      sections: [],
      sectionsById: new Map(),
    });
    expect(stateAfterUnmount.sectionSeedNodes.get("section-a")).toEqual({
      width: 240,
      height: 160,
      sizeAuthority: "sharedNode",
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
