import type { PluginRuntimeResponse } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { shouldShowWatchCodePortalControl } from "./Controls";

const activeWatchCodeCapabilities: NonNullable<
  PluginRuntimeResponse["featureCapabilities"]
>["watchCode"] = {
  providerSelection: {
    status: "active",
    selectedPluginId: "setta-watch-code",
    activePluginIds: ["setta-watch-code"],
    disabledPluginIds: [],
    invalidPluginIds: [],
    conflictingPluginIds: [],
  },
  pluginId: "setta-watch-code",
  pluginEnabled: true,
  python: true,
  requiresLanguageServer: true,
  canvasControlsUi: false,
};

describe("shouldShowWatchCodePortalControl", () => {
  it("hides the Watch Code control in deployment mode", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: true,
        watchCodeCapabilities: activeWatchCodeCapabilities,
      }),
    ).toBe(false);
  });

  it("hides the Watch Code control when the provider is unavailable", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: false,
        watchCodeCapabilities: null,
      }),
    ).toBe(false);
  });

  it("shows the Watch Code control outside deployment mode with an active provider", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: false,
        watchCodeCapabilities: activeWatchCodeCapabilities,
      }),
    ).toBe(true);
  });
});
