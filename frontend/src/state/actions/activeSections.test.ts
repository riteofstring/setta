import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NULL_PROJECT_CONFIG_ID,
  useActiveSectionUI,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import * as endpoints from "utils/generatedEndpoints";

import { setActiveSectionIds } from "./activeSections";

function createWindowStub() {
  const location = { search: "" };
  const history = {
    replaceState: (
      _data: unknown,
      _unused: string,
      url: string | URL | null | undefined,
    ) => {
      if (typeof url === "string") {
        const queryIndex = url.indexOf("?");
        location.search = queryIndex >= 0 ? url.slice(queryIndex) : "";
        return;
      }
      if (url instanceof URL) {
        location.search = url.search;
        return;
      }
      location.search = "";
    },
  };
  return {
    location,
    history,
    requestAnimationFrame: (_callback: FrameRequestCallback) => 1,
    cancelAnimationFrame: (_handle: number) => undefined,
  } as unknown as Window & typeof globalThis;
}

describe("activeSections", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.stubGlobal("window", createWindowStub());
    window.history.replaceState({}, "", "/");
    useProjectState.setState((state) => {
      state.projectConfig.id = NULL_PROJECT_CONFIG_ID;
      state.projectConfig.activeIds = [];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetProjectStores();
  });

  it("does not call the backend when config id is null in app mode", () => {
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    const spy = vi.spyOn(endpoints, "route_set_active_ids");

    setActiveSectionIds(["section-a"]);

    expect(spy).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([
      "section-a",
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
  });

  it("warns and skips the backend when config id is null outside app mode", () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const endpointSpy = vi.spyOn(endpoints, "route_set_active_ids");

    setActiveSectionIds(["section-a"]);

    expect(endpointSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([
      "section-a",
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
  });

  it("updates the UI active ids immediately and defers the durable project-state sync when a real project config is loaded", () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
    });
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

    setActiveSectionIds(["section-a"]);

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(scheduledFrame).not.toBeNull();
    expect(endpointSpy).not.toHaveBeenCalled();

    scheduledFrame?.(16);

    expect(useProjectState.getState().projectConfig.activeIds).toEqual([
      "section-a",
    ]);
    expect(endpointSpy).toHaveBeenCalledOnce();
  });
});
