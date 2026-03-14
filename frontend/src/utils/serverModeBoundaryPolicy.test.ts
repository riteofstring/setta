import { describe, expect, it } from "vitest";

import { RouteEnum } from "./generatedTypes";
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
    expect(resolveEndpointOriginForMode(RouteEnum.LAUNCH, "ide")).toBe(
      "backend",
    );
    expect(resolveEndpointOriginForMode(RouteEnum.LAUNCH, "launcher")).toBe(
      "launcher",
    );
    expect(resolveEndpointOriginForMode(RouteEnum.LAUNCH, null)).toBe(
      "backend",
    );

    expect(
      resolveEndpointOriginForMode(
        RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT,
        "app",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT,
        "launcher",
      ),
    ).toBe("launcher");
  });

  it("keeps settaHomeInfo on backend across all modes", () => {
    expect(
      resolveEndpointOriginForMode(RouteEnum.GET_SETTA_HOME_INFO, "ide"),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(RouteEnum.GET_SETTA_HOME_INFO, "launcher"),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(RouteEnum.GET_SETTA_HOME_INFO, null),
    ).toBe("backend");
  });

  it("keeps launcher-home endpoints on launcher origin and bootstrap on backend origin", () => {
    expect(
      resolveEndpointOriginForMode(
        `${RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES}?setta_home=/tmp/home#x`,
        "ide",
      ),
    ).toBe("launcher");
    expect(
      resolveEndpointOriginForMode(
        `${RouteEnum.BOOTSTRAP_PAGE}#token=abc`,
        "launcher",
      ),
    ).toBe("backend-origin");
    expect(Object.keys(ENDPOINT_ORIGIN_POLICY)).not.toContain(
      "/launcherAppMode",
    );
  });
});
