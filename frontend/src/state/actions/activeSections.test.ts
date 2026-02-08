import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import * as endpoints from "utils/generatedEndpoints";

import { setActiveSectionIds } from "./activeSections";

describe("activeSections", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.id = NULL_PROJECT_CONFIG_ID;
      state.projectConfig.activeIds = [];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProjectStores();
  });

  it("does not call the backend when config id is null in app mode", () => {
    useServerMode.setState({ mode: "app", modeResolved: true, modeError: null });
    const spy = vi.spyOn(endpoints, "route_set_active_ids");

    setActiveSectionIds(["section-a"]);

    expect(spy).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.activeIds).toEqual(["section-a"]);
  });

  it("warns and skips the backend when config id is null outside app mode", () => {
    useServerMode.setState({ mode: "ide", modeResolved: true, modeError: null });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const endpointSpy = vi.spyOn(endpoints, "route_set_active_ids");

    setActiveSectionIds(["section-a"]);

    expect(endpointSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.activeIds).toEqual(["section-a"]);
  });
});

