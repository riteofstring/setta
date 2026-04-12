import type { ServerModeValue } from "utils/serverModeTypes";
import { describe, expect, it } from "vitest";

import { TransportRouteConstants } from "./generatedTypes";
import {
  ENDPOINT_ORIGIN_POLICY,
  resolveEndpointOriginForMode,
  resolveServerModeCapabilities,
  resolveWorkspaceLaunchRouteKind,
} from "./serverModeBoundaryPolicy";
import { ROOT_TRANSPORT_ROUTES } from "./transportRouteConstants";

function modeSupportsWorkspaceLaunch(mode: ServerModeValue): boolean {
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
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.launch,
        "ide",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.launch,
        "launcher",
      ),
    ).toBe("launcher");
    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.launch,
        null,
      ),
    ).toBe("backend");

    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent,
        "app",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent,
        "launcher",
      ),
    ).toBe("launcher");
  });

  it("keeps settaHomeInfo on backend across all modes", () => {
    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.getSettaHomeInfo,
        "ide",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.getSettaHomeInfo,
        "launcher",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        TransportRouteConstants.serverModeBoundary.getSettaHomeInfo,
        null,
      ),
    ).toBe("backend");
  });

  it("keeps launcher-home endpoints on launcher origin and bootstrap on backend origin", () => {
    expect(
      resolveEndpointOriginForMode(
        `${TransportRouteConstants.serverModeBoundary.getLauncherRecentWorkspaces}?setta_home=/tmp/home#x`,
        "ide",
      ),
    ).toBe("launcher");
    expect(
      resolveEndpointOriginForMode(
        `${ROOT_TRANSPORT_ROUTES.bootstrapPage}#token=abc`,
        "launcher",
      ),
    ).toBe("backend-origin");
    expect(Object.keys(ENDPOINT_ORIGIN_POLICY)).not.toContain(
      "/launcherAppMode",
    );
  });
});
