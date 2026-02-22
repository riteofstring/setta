import { describe, expect, it } from "vitest";

import { resolveModeElementForServerMode } from "./modeRouteResolver";
import { modeSupportsWorkspaceLaunch } from "./workspaceLaunchModePolicy";

describe("resolveModeElementForServerMode", () => {
  const modeRoutes = {
    ide: "ide-route",
    share: "share-route",
    app: "app-route",
    launcher: "launcher-route",
  };

  it("uses explicit app route in app mode", () => {
    // App mode must never fall back to IDE route elements.
    const resolved = resolveModeElementForServerMode("app", modeRoutes);
    expect(resolved).toBe("app-route");
  });

  it("uses explicit share and launcher routes", () => {
    // Non-IDE modes each resolve to their own dedicated route element.
    expect(resolveModeElementForServerMode("share", modeRoutes)).toBe(
      "share-route",
    );
    expect(resolveModeElementForServerMode("launcher", modeRoutes)).toBe(
      "launcher-route",
    );
  });

  it("falls back to ide route only for ide/null modes", () => {
    // IDE fallback remains valid for explicit IDE mode and unresolved state.
    expect(resolveModeElementForServerMode("ide", modeRoutes)).toBe(
      "ide-route",
    );
    expect(resolveModeElementForServerMode(null, modeRoutes)).toBe("ide-route");
  });

  it("keeps workspace-launch handoff enabled in launcher mode", () => {
    // Handoff route support is explicit per mode to avoid launcher regressions.
    expect(modeSupportsWorkspaceLaunch("ide")).toBe(true);
    expect(modeSupportsWorkspaceLaunch("launcher")).toBe(true);
    expect(modeSupportsWorkspaceLaunch("share")).toBe(false);
    expect(modeSupportsWorkspaceLaunch("app")).toBe(false);
  });
});
