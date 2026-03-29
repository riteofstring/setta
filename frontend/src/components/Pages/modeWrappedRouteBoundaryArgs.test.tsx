import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedRouteBoundaryArgs } from "./modeWrappedRouteBoundaryArgs";

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

function createModeRouteElements(label: string): ModeRouteElements {
  return {
    ide: <div data-testid={`${label}-ide`} />,
    share: <div data-testid={`${label}-share`} />,
    app: <div data-testid={`${label}-app`} />,
    launcher: <div data-testid={`${label}-launcher`} />,
  };
}

describe("buildModeWrappedRouteBoundaryArgs", () => {
  it("owns the lifted mode-route-boundary render callback and view-mode alias", () => {
    const projectRouteElements = createModeRouteElements("project");

    const args = buildModeWrappedRouteBoundaryArgs({
      projectRouteElements,
    });

    expect(args.viewModeRouteElements).toBe(projectRouteElements);

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
