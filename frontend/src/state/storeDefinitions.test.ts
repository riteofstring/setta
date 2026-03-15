import { describe, expect, it } from "vitest";
import {
  NULL_PROJECT_CONFIG_ID,
  useActiveSectionUI,
  useProjectState,
} from "./storeDefinitions";
import { resetProjectStores } from "./utils";

describe("storeDefinitions", () => {
  it("seeds the project store with the null project config id", () => {
    resetProjectStores();

    expect(useProjectState.getState().projectConfig.id).toBe(
      NULL_PROJECT_CONFIG_ID,
    );
  });

  it("seeds the active section UI store with backend hydration enabled", () => {
    resetProjectStores();

    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
  });
});
