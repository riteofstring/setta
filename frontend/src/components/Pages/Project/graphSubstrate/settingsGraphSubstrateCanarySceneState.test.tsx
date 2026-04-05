/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNodeInternals, useSectionRefs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type {
  SettingsGraphSubstrateCanarySceneSnapshot,
  SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneState } from "./settingsGraphSubstrateCanarySceneState";

type ResizeObserverController = {
  trigger: (elements: Array<HTMLElement>) => Promise<void>;
};

type MeasuredElementController = {
  element: HTMLElement;
  setSize: (nextSize: { width: number; height: number }) => void;
};

function SceneStateProbe({
  override,
  sections,
}: {
  override: SettingsGraphSubstrateCanarySectionPositionOverride;
  sections: Array<GraphSubstrateCanarySection>;
}) {
  const { sceneSnapshot, setSectionPositionOverride } =
    useSettingsGraphSubstrateCanarySceneState(sections);

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
  let resizeObserverController: ResizeObserverController;

  beforeEach(() => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    resizeObserverController = installResizeObserverMock();
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
        <SceneStateProbe override={null} sections={[createSection()]} />,
      );
    });

    const sectionElement = createMeasuredElement({
      width: 280,
      height: 190,
    });
    act(() => {
      useSectionRefs.setState((state) => {
        state.selfOnly["section-a"] = sectionElement.element;
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

    await resizeObserverController.trigger([sectionElement.element]);

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

function installResizeObserverMock(): ResizeObserverController {
  const callbacks = new Set<ResizeObserverCallback>();

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        callbacks.add(callback);
      }

      observe() {}

      unobserve() {}

      disconnect() {
        callbacks.delete(this.callback);
      }
    },
  );

  return {
    trigger: async (elements) => {
      const entries = elements.map((element) => {
        return { target: element } as ResizeObserverEntry;
      });
      await act(async () => {
        callbacks.forEach((callback) =>
          callback(entries, {} as ResizeObserver),
        );
      });
    },
  };
}

function createMeasuredElement(initialSize: {
  width: number;
  height: number;
}): MeasuredElementController {
  const element = document.createElement("section");
  let size = initialSize;

  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get() {
      return size.width;
    },
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get() {
      return size.height;
    },
  });

  return {
    element,
    setSize: (nextSize) => {
      size = nextSize;
    },
  };
}
