import { describe, expect, it, vi } from "vitest";

import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedRouteBoundaryArgs } from "./modeWrappedRouteBoundaryArgs";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

vi.mock("./modeWrappedRouteBoundaryArgs", () => ({
  buildModeWrappedRouteBoundaryArgs: vi.fn(),
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
  it("accepts a caller-owned section boundary above modeWrappedRouterRouteElements.ts", () => {
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
    const routeBoundaryArgs = {
      renderModeElement: vi.fn(),
      viewModeRouteElements: projectRouteElements,
    };
    const MockSectionBoundary = ({ sectionId }: { sectionId: string }) => (
      <div data-testid="mock-section-boundary" data-section-id={sectionId} />
    );

    vi.mocked(buildModeWrappedRouterRouteElements).mockReturnValue({
      indexRouteElements,
      homeRouteElements,
      workspaceLaunchRouteElements,
      projectRouteElements,
      catchAllRouteElements,
      standaloneAppRouteElement,
      standaloneLauncherRouteElement,
    });
    vi.mocked(buildModeWrappedRouteBoundaryArgs).mockReturnValue(
      routeBoundaryArgs,
    );

    const args = buildModeWrappedRouterArgs({
      SectionBoundary: MockSectionBoundary,
    });

    expect(buildModeWrappedRouterRouteElements).toHaveBeenCalledOnce();
    expect(buildModeWrappedRouterRouteElements).toHaveBeenCalledWith({
      SectionBoundary: MockSectionBoundary,
    });
    expect(buildModeWrappedRouteBoundaryArgs).toHaveBeenCalledOnce();
    expect(buildModeWrappedRouteBoundaryArgs).toHaveBeenCalledWith({
      projectRouteElements,
    });

    expect(args.indexRouteElements).toBe(indexRouteElements);
    expect(args.homeRouteElements).toBe(homeRouteElements);
    expect(args.workspaceLaunchRouteElements).toBe(
      workspaceLaunchRouteElements,
    );
    expect(args.projectRouteElements).toBe(projectRouteElements);
    expect(args.viewModeRouteElements).toBe(
      routeBoundaryArgs.viewModeRouteElements,
    );
    expect(args.catchAllRouteElements).toBe(catchAllRouteElements);
    expect(args.standaloneAppRouteElement).toBe(standaloneAppRouteElement);
    expect(args.standaloneLauncherRouteElement).toBe(
      standaloneLauncherRouteElement,
    );
    expect(args.renderModeElement).toBe(routeBoundaryArgs.renderModeElement);
  });
});
