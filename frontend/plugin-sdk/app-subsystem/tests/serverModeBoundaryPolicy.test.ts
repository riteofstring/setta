import { describe, expect, it } from "vitest";
import type { ServerMode as ServerModeValue } from "../src/serverModeBoundaryPolicy";

import {
  EndpointOriginPolicyByRoute,
  TransportRouteConstants,
} from "../src/generatedTypes";
import {
  resolveEndpointOriginForMode,
  resolveServerModeCapabilities,
  resolveWorkspaceLaunchRouteKind,
} from "../src/serverModeBoundaryPolicy";
import { ROOT_TRANSPORT_ROUTES } from "../src/transportRouteConstants";

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

  it("keeps explicit backend-origin root routes on backend origin", () => {
    expect(
      resolveEndpointOriginForMode(
        `${ROOT_TRANSPORT_ROUTES.bootstrapPage}#token=abc`,
        "launcher",
      ),
    ).toBe("backend-origin");
    expect(
      resolveEndpointOriginForMode(
        `${ROOT_TRANSPORT_ROUTES.toolsCall}?id=call-a`,
        "launcher",
      ),
    ).toBe("backend-origin");
    expect(EndpointOriginPolicyByRoute[ROOT_TRANSPORT_ROUTES.toolsCall]).toBe(
      "backend-origin",
    );
  });

  it("defaults unscoped SDK endpoints to backend across modes", () => {
    expect(
      resolveEndpointOriginForMode(
        `${TransportRouteConstants.apiPrefix}/x`,
        "ide",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        `${TransportRouteConstants.apiPrefix}/x`,
        "launcher",
      ),
    ).toBe("backend");
    expect(
      resolveEndpointOriginForMode(
        `${TransportRouteConstants.apiPrefix}/x`,
        null,
      ),
    ).toBe("backend");
  });

  it("keeps launcher-only routes out of the pruned SDK transport contract", () => {
    expect(Object.keys(TransportRouteConstants)).not.toContain(
      "serverModeBoundary",
    );
    expect(Object.keys(EndpointOriginPolicyByRoute)).not.toContain(
      "/launcherAppMode",
    );
  });
});
