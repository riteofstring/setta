import { describe, expect, it } from "vitest";

import { resolveWorkspaceLaunchRouteKind } from "utils/serverModeBoundaryPolicy";
import {
  resolveModeElementForServerMode,
  type ServerModeValue,
} from "./modeRouteResolver";

function modeSupportsWorkspaceLaunch(mode: ServerModeValue): boolean {
  return resolveWorkspaceLaunchRouteKind(mode) !== "blocked";
}

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

  it("derives workspace-launch support from route-kind policy", () => {
    // Route-kind policy is the single source of truth for launch support.
    expect(modeSupportsWorkspaceLaunch("ide")).toBe(true);
    expect(modeSupportsWorkspaceLaunch("launcher")).toBe(true);
    expect(modeSupportsWorkspaceLaunch("share")).toBe(false);
    expect(modeSupportsWorkspaceLaunch("app")).toBe(false);
  });

  it("resolves launcher /launching to launcher-only route kind", () => {
    // This keeps launcher mode from inheriting IDE-only wrappers.
    expect(resolveWorkspaceLaunchRouteKind("ide")).toBe("ide");
    expect(resolveWorkspaceLaunchRouteKind("launcher")).toBe("launcher");
    expect(resolveWorkspaceLaunchRouteKind("share")).toBe("blocked");
    expect(resolveWorkspaceLaunchRouteKind("app")).toBe("blocked");
  });
});
