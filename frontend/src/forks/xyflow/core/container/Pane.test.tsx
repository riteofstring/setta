/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSettings } from "state/stores/uiPreferenceStores";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveSectionUI, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import * as endpoints from "utils/generatedEndpoints";
import { createSettingsState } from "utils/generatedTypes";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import Pane from "./Pane";

type RenderedPane = {
  host: HTMLDivElement;
  pane: HTMLDivElement;
  root: Root;
};

async function dispatchMouseEvent(
  target: HTMLElement,
  type: "mousedown" | "mouseup" | "mouseout",
  init: MouseEventInit,
) {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

async function renderPane(): Promise<RenderedPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Pane isSelecting panOnDrag={false}>
        <div />
      </Pane>,
    );
  });

  const pane = host.querySelector(".react-flow__pane");
  if (!(pane instanceof HTMLDivElement)) {
    throw new Error("Pane test failed to render the canvas pane.");
  }

  Object.defineProperty(pane, "getBoundingClientRect", {
    value: () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
  });

  useReactFlow.setState({ domNode: pane });
  return { host, pane, root };
}

describe("Pane", () => {
  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState, width: 800, height: 600 });
    useSettings.setState(createSettingsState());
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.activeIds = ["section-a"];
    });
    useActiveSectionUI.setState({
      activeIds: ["section-a"],
      selectionGeneration: 1,
      backendGeneration: 1,
      backendHydrationEnabled: true,
      pendingBackendSyncOpIds: [],
      pendingBackendSyncGenerationByOpId: {},
      scheduledBackendSync: null,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    document.body.innerHTML = "";
  });

  it("durably commits a blank-pane deselect when selection mode ends without a drag", async () => {
    const endpointSpy = vi
      .spyOn(endpoints, "route_set_active_ids")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { host, pane, root } = await renderPane();

    try {
      await dispatchMouseEvent(pane, "mousedown", {
        button: 0,
        clientX: 320,
        clientY: 240,
      });
      await dispatchMouseEvent(pane, "mouseup", {
        button: 0,
        clientX: 320,
        clientY: 240,
      });

      // The UI should clear immediately and then schedule exactly one durable publish.
      expect(useActiveSectionUI.getState().activeIds).toEqual([]);
      expect(scheduledFrame).not.toBeNull();
      expect(endpointSpy).not.toHaveBeenCalled();

      scheduledFrame?.(16);

      expect(endpointSpy).toHaveBeenCalledOnce();
      expect(endpointSpy).toHaveBeenCalledWith({
        activeIds: [],
        frontendOpId: expect.any(String),
        projectConfigId: "project-a",
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("durably commits the cleared selection when a no-drag selection gesture leaves the pane", async () => {
    const endpointSpy = vi
      .spyOn(endpoints, "route_set_active_ids")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { host, pane, root } = await renderPane();

    try {
      await dispatchMouseEvent(pane, "mousedown", {
        button: 0,
        clientX: 280,
        clientY: 200,
      });
      await dispatchMouseEvent(pane, "mouseout", {
        clientX: 280,
        clientY: 200,
      });

      // Mouseleave should flush the same final selection instead of abandoning the UI-only state.
      expect(useActiveSectionUI.getState().activeIds).toEqual([]);
      expect(scheduledFrame).not.toBeNull();
      expect(endpointSpy).not.toHaveBeenCalled();

      scheduledFrame?.(16);

      expect(endpointSpy).toHaveBeenCalledOnce();
      expect(endpointSpy).toHaveBeenCalledWith({
        activeIds: [],
        frontendOpId: expect.any(String),
        projectConfigId: "project-a",
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
