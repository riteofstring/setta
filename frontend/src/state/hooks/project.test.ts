import { describe, expect, it } from "vitest";

import { PAGE_LOAD_TYPES } from "utils/constants";

import { resolveProjectLoadIntent } from "./project";

describe("resolveProjectLoadIntent", () => {
  it("returns null when projectConfigName is missing", () => {
    expect(
      resolveProjectLoadIntent({
        projectConfigName: undefined,
        doneLoading: false,
        pageLoadType: undefined,
      }),
    ).toBeNull();
  });

  it("returns load when not doneLoading", () => {
    expect(
      resolveProjectLoadIntent({
        projectConfigName: "sample_project",
        doneLoading: false,
        pageLoadType: undefined,
      }),
    ).toBe("load");
  });

  it("returns load when pageLoadType requests a full reload", () => {
    expect(
      resolveProjectLoadIntent({
        projectConfigName: "sample_project",
        doneLoading: true,
        pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG,
      }),
    ).toBe("load");
  });

  it("returns change when pageLoadType requests a name sync", () => {
    expect(
      resolveProjectLoadIntent({
        projectConfigName: "renamed_project",
        doneLoading: true,
        pageLoadType: PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME,
      }),
    ).toBe("change");
  });

  it("returns null when already loaded and no explicit pageLoadType was provided", () => {
    expect(
      resolveProjectLoadIntent({
        projectConfigName: "sample_project",
        doneLoading: true,
        pageLoadType: undefined,
      }),
    ).toBeNull();
  });
});
