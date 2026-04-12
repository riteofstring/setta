import { describe, expect, it } from "vitest";
import {
  isAppReadySnapshot,
  type AppReadySnapshot,
} from "../../tests/e2e/helpers";

function createSnapshot(
  overrides: Partial<AppReadySnapshot> = {},
): AppReadySnapshot {
  return {
    canaryRootMounted: false,
    legacyPaneMounted: false,
    projectIsLoading: false,
    ...overrides,
  };
}

describe("isAppReadySnapshot", () => {
  it("treats the legacy graph pane as ready once project loading finishes", () => {
    expect(
      isAppReadySnapshot(createSnapshot({ legacyPaneMounted: true })),
    ).toBe(true);
  });

  it("treats the canary graph surface as ready once project loading finishes", () => {
    expect(
      isAppReadySnapshot(createSnapshot({ canaryRootMounted: true })),
    ).toBe(true);
  });

  it("does not report ready while project loading is still active", () => {
    expect(
      isAppReadySnapshot(
        createSnapshot({
          canaryRootMounted: true,
          legacyPaneMounted: true,
          projectIsLoading: true,
        }),
      ),
    ).toBe(false);
  });

  it("does not report ready when no graph surface is mounted", () => {
    expect(isAppReadySnapshot(createSnapshot())).toBe(false);
  });
});
