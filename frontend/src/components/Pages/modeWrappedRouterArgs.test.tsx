import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

vi.mock("./ModeWrappedRouteBoundary", () => ({
  ModeWrappedRouteBoundary: vi.fn(
    ({
      ide,
      share,
      app,
      launcher,
    }: {
      ide: ReactNode;
      share: ReactNode;
      app: ReactNode;
      launcher: ReactNode;
    }) => (
      <div
        data-testid="mode-route-boundary"
        data-app-route={app !== null}
        data-ide-route={ide !== null}
        data-launcher-route={launcher !== null}
        data-share-route={share !== null}
      />
    ),
  ),
}));

vi.mock("./modeWrappedRouterRouteElements", () => ({
  buildModeWrappedRouterRouteElements: vi.fn(),
}));

function createModeRouteElements(label: string): ModeRouteElements {
  return {
    ide: <div data-testid={`${label}-ide`} />,
    share: <div data-testid={`${label}-share`} />,
    app: <div data-testid={`${label}-app`} />,
    launcher: <div data-testid={`${label}-launcher`} />,
  };
}

describe("buildModeWrappedRouterArgs", () => {
  it("owns the remaining router-args seam above router.tsx", () => {
    const standaloneAppRouteElement = (
      <div data-testid="standalone-app-route-copy" />
    );
    const standaloneLauncherRouteElement = (
      <div data-testid="standalone-launcher-route" />
    );
    const homeRouteElements = createModeRouteElements("home");
    const projectRouteElements = createModeRouteElements("project");
    const catchAllRouteElements = createModeRouteElements("catch-all");
    const indexRouteElements = createModeRouteElements("index");
    const workspaceLaunchRouteElements =
      createModeRouteElements("workspace-launch");

    vi.mocked(buildModeWrappedRouterRouteElements).mockReturnValue({
      indexRouteElements,
      homeRouteElements,
      workspaceLaunchRouteElements,
      projectRouteElements,
      catchAllRouteElements,
      standaloneAppRouteElement,
      standaloneLauncherRouteElement,
    });

    const args = buildModeWrappedRouterArgs();

    expect(buildModeWrappedRouterRouteElements).toHaveBeenCalledOnce();

    expect(args.indexRouteElements).toBe(indexRouteElements);
    expect(args.homeRouteElements).toBe(homeRouteElements);
    expect(args.workspaceLaunchRouteElements).toBe(
      workspaceLaunchRouteElements,
    );
    expect(args.projectRouteElements).toBe(projectRouteElements);
    expect(args.viewModeRouteElements).toBe(projectRouteElements);
    expect(args.catchAllRouteElements).toBe(catchAllRouteElements);
    expect(args.standaloneAppRouteElement).toBe(standaloneAppRouteElement);
    expect(args.standaloneLauncherRouteElement).toBe(
      standaloneLauncherRouteElement,
    );

    const boundaryMarkup = renderToStaticMarkup(
      <>{args.renderModeElement(createModeRouteElements("mode-boundary"))}</>,
    );

    expect(boundaryMarkup).toContain('data-testid="mode-route-boundary"');
    expect(boundaryMarkup).toContain('data-ide-route="true"');
    expect(boundaryMarkup).toContain('data-share-route="true"');
    expect(boundaryMarkup).toContain('data-app-route="true"');
    expect(boundaryMarkup).toContain('data-launcher-route="true"');
  });
});
