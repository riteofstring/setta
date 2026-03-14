/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";

import {
  CanvasEngineHost,
  createCanvasEngineHostSnapshotResult,
} from "./CanvasEngineHost";

describe("CanvasEngineHost", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let originalClientWidth: PropertyDescriptor | undefined;
  let originalClientHeight: PropertyDescriptor | undefined;
  let originalCanvasGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    resetProjectStores();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

    originalClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 640;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return 360;
      },
    });

    class ResizeObserverStub {
      observe() {}

      disconnect() {}

      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return null;
    };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
    vi.unstubAllGlobals();

    if (originalClientWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientWidth",
        originalClientWidth,
      );
    }
    if (originalClientHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientHeight",
        originalClientHeight,
      );
    }
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
  });

  it("builds scene counts for the scaffold host from project state inputs", () => {
    const projectConfig = createProjectConfig({
      id: "project-config-1",
    });
    projectConfig.activeIds = ["section-b"];
    projectConfig.topLevelSections = {
      "section-a": {
        x: 0,
        y: 0,
        zIndex: 0,
        w: 320,
        h: 200,
      },
      "section-b": {
        x: 420,
        y: 80,
        zIndex: 1,
        w: 360,
        h: 220,
      },
    };
    projectConfig.edges = [
      {
        id: "edge-data-1",
        sourceSectionId: "section-a",
        sourceVariantId: "variant-a",
        sourcePortId: "out-a",
        targetSectionId: "section-b",
        targetVariantId: "variant-b",
        targetPortId: "in-b",
        type: "default",
        label: null,
        style: null,
        animated: false,
        hidden: false,
        zIndex: 0,
        data: null,
        selected: false,
      },
    ];
    projectConfig.agenticEdges = [
      {
        id: "edge-agentic-1",
        sourceSectionId: "section-b",
        targetSectionId: "section-a",
        kind: "chat_chat",
        contextMode: "reference_only",
        style: null,
        hidden: false,
        zIndex: 0,
        selected: false,
      },
    ];
    const snapshotResult = createCanvasEngineHostSnapshotResult({
      topLevelSections: projectConfig.topLevelSections,
      activeSectionIds: projectConfig.activeIds,
      edges: projectConfig.edges,
      agenticEdges: projectConfig.agenticEdges,
      edgeHandlePositions: {},
      sectionEdgePortsBySectionId: {},
    });

    expect(snapshotResult.totalRectCount).toBe(2);
    expect(snapshotResult.totalDataEdgeCount).toBe(1);
    expect(snapshotResult.totalAgenticEdgeCount).toBe(1);
    expect(snapshotResult.snapshot.rects.map((rect) => rect.id)).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("renders the canvas after async renderer initialization completes", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.activeIds = ["section-a"];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    // The renderer initializes asynchronously; the host still needs a draw pass
    // once that backend selection promise settles.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = host.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(640);
    expect(canvas?.height).toBe(360);

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLElement | null;
    expect(engineHost?.dataset.canvasEngineRectCount).toBe("1");
  });
});
