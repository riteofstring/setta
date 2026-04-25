import { describe, expect, it } from "vitest";

import { matchRoutes } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SECTION_STANDALONE_ROUTER_PATH,
  VIEW_MODE_ROUTER_PATH,
  WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  WORKSPACE_LAUNCH_ROUTER_PATH,
} from "utils/constants";
import { resolveWorkspaceLaunchRouteKind } from "utils/serverModeBoundaryPolicy";
import type { ServerModeValue } from "utils/serverModeTypes";
import { resolveModeElementForServerMode } from "./modeRouteResolver";
import { APP_ROUTE_IDS } from "./routeConfig";

function modeSupportsWorkspaceLaunch(mode: ServerModeValue): boolean {
  return resolveWorkspaceLaunchRouteKind(mode) !== "blocked";
}

const TEST_ROUTE_PATTERNS = [
  { id: APP_ROUTE_IDS.index, path: INDEX_ROUTER_PATH },
  { id: APP_ROUTE_IDS.home, path: HOME_ROUTER_PATH },
  { id: APP_ROUTE_IDS.workspaceLaunch, path: WORKSPACE_LAUNCH_ROUTER_PATH },
  {
    id: APP_ROUTE_IDS.projectChatThreadStandalone,
    path: PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.projectChatStandalone,
    path: PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.windowSpaceStandalone,
    path: WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  },
  { id: APP_ROUTE_IDS.viewMode, path: VIEW_MODE_ROUTER_PATH },
  {
    id: APP_ROUTE_IDS.sectionStandalone,
    path: SECTION_STANDALONE_ROUTER_PATH,
  },
  { id: APP_ROUTE_IDS.project, path: PROJECT_CONFIG_ROUTER_PATH },
  { id: APP_ROUTE_IDS.catchAll, path: "*" },
] as const;

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

describe("appRoutes", () => {
  function getMatchedRouteId(pathname: string): string | undefined {
    return matchRoutes(TEST_ROUTE_PATTERNS, pathname)?.at(-1)?.route.id;
  }

  it("matches standalone project chat before the generic project route", () => {
    expect(getMatchedRouteId("/demo/chat")).toBe(
      APP_ROUTE_IDS.projectChatStandalone,
    );
  });

  it("matches standalone project chat thread routes before the chat landing route", () => {
    expect(getMatchedRouteId("/demo/chat/thread-123")).toBe(
      APP_ROUTE_IDS.projectChatThreadStandalone,
    );
  });

  it("matches standalone window-space routes before view and project routes", () => {
    expect(getMatchedRouteId("/demo/windowspace/research_board")).toBe(
      APP_ROUTE_IDS.windowSpaceStandalone,
    );
  });

  it("keeps view mode routing ahead of standalone section routes", () => {
    expect(getMatchedRouteId("/demo/view/analysis")).toBe(
      APP_ROUTE_IDS.viewMode,
    );
  });

  it("matches canonical section slugs on the namespaced standalone section route", () => {
    expect(getMatchedRouteId("/demo/section/blue_star")).toBe(
      APP_ROUTE_IDS.sectionStandalone,
    );
  });

  it("leaves bare project paths on the generic project route", () => {
    expect(getMatchedRouteId("/demo")).toBe(APP_ROUTE_IDS.project);
  });
});
