import { describe, expect, it } from "vitest";
import {
  isSettingsGraphCompareTransientChromeSettled,
  type SettingsGraphCompareTransientChromeSnapshot,
} from "./settingsGraphCompareTransientChrome";

function createSnapshot(
  overrides: Partial<SettingsGraphCompareTransientChromeSnapshot> = {},
): SettingsGraphCompareTransientChromeSnapshot {
  return {
    graphSurfaceMounted: true,
    headerNotificationVisible: false,
    projectIsLoading: false,
    settingsContentMounted: true,
    ...overrides,
  };
}

describe("isSettingsGraphCompareTransientChromeSettled", () => {
  it("treats mounted settings content without header chrome as settled even if the loading flag lingers", () => {
    expect(
      isSettingsGraphCompareTransientChromeSettled(
        createSnapshot({ projectIsLoading: true }),
      ),
    ).toBe(true);
  });

  it("waits while the header notification is still visible", () => {
    expect(
      isSettingsGraphCompareTransientChromeSettled(
        createSnapshot({ headerNotificationVisible: true }),
      ),
    ).toBe(false);
  });

  it("waits until settings content is actually mounted", () => {
    expect(
      isSettingsGraphCompareTransientChromeSettled(
        createSnapshot({ settingsContentMounted: false }),
      ),
    ).toBe(false);
  });

  it("waits until the graph surface is mounted", () => {
    expect(
      isSettingsGraphCompareTransientChromeSettled(
        createSnapshot({ graphSurfaceMounted: false }),
      ),
    ).toBe(false);
  });
});
