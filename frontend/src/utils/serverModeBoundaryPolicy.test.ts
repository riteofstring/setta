import { describe, expect, it } from "vitest";

import { GoHTTPRouteHelpers, GoRootRouteHelpers } from "./generatedRoutes";
import {
  ENDPOINT_ORIGIN_POLICY,
  resolveEndpointOriginForMode,
  resolveServerModeCapabilities,
  resolveWorkspaceLaunchRouteKind,
} from "./serverModeBoundaryPolicy";

function modeSupportsWorkspaceLaunch(
  mode: "ide" | "share" | "app" | "launcher" | null,
): boolean {
  return resolveWorkspaceLaunchRouteKind(mode) !== "blocked";
}

describe("serverModeBoundaryPolicy", () => {
  it("keeps mode capabilities and workspace-launch behavior in one contract", () => {
    expect(resolveServerModeCapabilities("ide").canManageDesktopLauncher).toBe(
      true,
    );
    expect(resolveWorkspaceLaunchRouteKind("ide")).toBe("ide");
    expect(modeSupportsWorkspaceLaunch("ide")).toBe(true);

    expect(
      resolveServerModeCapabilities("launcher").canManageDesktopLauncher,
    ).toBe(false);
    expect(resolveWorkspaceLaunchRouteKind("launcher")).toBe("launcher");
    expect(modeSupportsWorkspaceLaunch("launcher")).toBe(true);

    expect(resolveWorkspaceLaunchRouteKind("share")).toBe("blocked");
    expect(modeSupportsWorkspaceLaunch("share")).toBe(false);
    expect(resolveWorkspaceLaunchRouteKind("app")).toBe("blocked");
    expect(modeSupportsWorkspaceLaunch("app")).toBe(false);
    expect(resolveWorkspaceLaunchRouteKind(null)).toBe("blocked");
    expect(modeSupportsWorkspaceLaunch(null)).toBe(false);
  });

  it("keeps launch and launch-intent endpoint origin mode-scoped", () => {
    expect(
      resolveEndpointOriginForMode(GoHTTPRouteHelpers.launch(), "ide"),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(GoHTTPRouteHelpers.launch(), "launcher"),
    ).toBe("launcher");
    expect(
      resolveEndpointOriginForMode(GoHTTPRouteHelpers.launch(), null),
    ).toBe("backend");

    expect(
      resolveEndpointOriginForMode(
        GoHTTPRouteHelpers.createWorkspaceLaunchIntent(),
        "app",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        GoHTTPRouteHelpers.createWorkspaceLaunchIntent(),
        "launcher",
      ),
    ).toBe("launcher");
  });

  it("keeps settaHomeInfo on backend across all modes", () => {
    expect(
      resolveEndpointOriginForMode(
        GoHTTPRouteHelpers.getSettaHomeInfo(),
        "ide",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        GoHTTPRouteHelpers.getSettaHomeInfo(),
        "launcher",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(GoHTTPRouteHelpers.getSettaHomeInfo(), null),
    ).toBe("backend");
  });

  it("keeps launcher-home endpoints on launcher origin and bootstrap on backend origin", () => {
    expect(
      resolveEndpointOriginForMode(
        `${GoHTTPRouteHelpers.getLauncherRecentWorkspaces()}?setta_home=/tmp/home#x`,
        "ide",
      ),
    ).toBe("launcher");
    expect(
      resolveEndpointOriginForMode(
        `${GoRootRouteHelpers.bootstrapPage()}#token=abc`,
        "launcher",
      ),
    ).toBe("backend-origin");
    expect(Object.keys(ENDPOINT_ORIGIN_POLICY)).not.toContain(
      "/launcherAppMode",
    );
  });
});
