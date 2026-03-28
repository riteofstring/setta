import { describe, expect, it, vi } from "vitest";

import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedHomeProjectCatchAllRouteElements } from "./modeWrappedHomeProjectCatchAllRouteElements";
import { buildModeWrappedIndexWorkspaceLaunchRouteElements } from "./modeWrappedIndexWorkspaceLaunchRouteElements";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";
import { buildModeWrappedStandaloneAppLauncherRouteElements } from "./modeWrappedStandaloneAppLauncherRouteElements";

vi.mock("./modeWrappedStandaloneAppLauncherRouteElements", () => ({
  buildModeWrappedStandaloneAppLauncherRouteElements: vi.fn(),
}));

vi.mock("./modeWrappedHomeProjectCatchAllRouteElements", () => ({
  buildModeWrappedHomeProjectCatchAllRouteElements: vi.fn(),
}));

vi.mock("./modeWrappedIndexWorkspaceLaunchRouteElements", () => ({
  buildModeWrappedIndexWorkspaceLaunchRouteElements: vi.fn(),
}));

vi.mock("components/Section/Container/SectionContainerBoundary", () => ({
  SectionContainerBoundary: vi.fn(),
}));

function createModeRouteElements(label: string): ModeRouteElements {
  return {
    ide: <div data-testid={`${label}-ide`} />,
    share: <div data-testid={`${label}-share`} />,
    app: <div data-testid={`${label}-app`} />,
    launcher: <div data-testid={`${label}-launcher`} />,
  };
}

describe("buildModeWrappedRouterRouteElements", () => {
  it("owns the lifted route-element bundle assembly and section-boundary seam above modeWrappedRouterArgs.tsx", () => {
    const appRouteElement = <div data-testid="standalone-app-route" />;
    const launcherHomeRouteElement = <div data-testid="launcher-home-route" />;
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

    vi.mocked(
      buildModeWrappedStandaloneAppLauncherRouteElements,
    ).mockReturnValue({
      appRouteElement,
      launcherHomeRouteElement,
      standaloneAppRouteElement,
      standaloneLauncherRouteElement,
    });
    vi.mocked(buildModeWrappedHomeProjectCatchAllRouteElements).mockReturnValue(
      {
        homeRouteElements,
        projectRouteElements,
        catchAllRouteElements,
      },
    );
    vi.mocked(
      buildModeWrappedIndexWorkspaceLaunchRouteElements,
    ).mockReturnValue({
      indexRouteElements,
      workspaceLaunchRouteElements,
    });

    const routeElements = buildModeWrappedRouterRouteElements();

    expect(
      buildModeWrappedStandaloneAppLauncherRouteElements,
    ).toHaveBeenCalledOnce();
    expect(
      buildModeWrappedHomeProjectCatchAllRouteElements,
    ).toHaveBeenCalledWith({
      appRouteElement,
      launcherHomeRouteElement,
      SectionBoundary: SectionContainerBoundary,
    });
    expect(
      buildModeWrappedIndexWorkspaceLaunchRouteElements,
    ).toHaveBeenCalledWith({
      appRouteElement,
      launcherHomeRouteElement,
    });

    expect(routeElements.indexRouteElements).toBe(indexRouteElements);
    expect(routeElements.homeRouteElements).toBe(homeRouteElements);
    expect(routeElements.workspaceLaunchRouteElements).toBe(
      workspaceLaunchRouteElements,
    );
    expect(routeElements.projectRouteElements).toBe(projectRouteElements);
    expect(routeElements.catchAllRouteElements).toBe(catchAllRouteElements);
    expect(routeElements.standaloneAppRouteElement).toBe(
      standaloneAppRouteElement,
    );
    expect(routeElements.standaloneLauncherRouteElement).toBe(
      standaloneLauncherRouteElement,
    );
  });
});
