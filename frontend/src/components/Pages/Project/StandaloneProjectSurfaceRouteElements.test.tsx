import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildStandaloneProjectSurfaceRouteElements,
  IdeStandaloneProjectSurfaceRouteElement,
} from "./StandaloneProjectSurfaceRouteElements";

vi.mock("./StandaloneProjectSurfaceRouteElementBoundary", () => ({
  IdeStandaloneProjectSurfaceRouteBoundary: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-ide-standalone-project-surface-route-boundary"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
  ShareStandaloneProjectSurfaceRouteBoundary: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-share-standalone-project-surface-route-boundary"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

describe("IdeStandaloneProjectSurfaceRouteElement", () => {
  it("routes the caller-owned dict-area renderer seam through the lifted ide route boundary", () => {
    const markup = renderToStaticMarkup(
      <IdeStandaloneProjectSurfaceRouteElement renderDictArea={() => null} />,
    );

    expect(markup).toContain(
      'data-testid="mock-ide-standalone-project-surface-route-boundary"',
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
  });
});

describe("buildStandaloneProjectSurfaceRouteElements", () => {
  it("reuses the lifted standalone/share route boundaries while preserving the caller-owned dict-area renderer seam plus app and launcher routes", () => {
    const routeElements = buildStandaloneProjectSurfaceRouteElements({
      app: <div data-testid="mock-app-route" />,
      launcher: <div data-testid="mock-launcher-route" />,
      renderDictArea: () => null,
    });

    const ideMarkup = renderToStaticMarkup(<>{routeElements.ide}</>);
    const shareMarkup = renderToStaticMarkup(<>{routeElements.share}</>);
    const appMarkup = renderToStaticMarkup(<>{routeElements.app}</>);
    const launcherMarkup = renderToStaticMarkup(<>{routeElements.launcher}</>);

    expect(ideMarkup).toContain(
      'data-testid="mock-ide-standalone-project-surface-route-boundary"',
    );
    expect(ideMarkup).toContain('data-has-render-dict-area="true"');
    expect(shareMarkup).toContain(
      'data-testid="mock-share-standalone-project-surface-route-boundary"',
    );
    expect(shareMarkup).toContain('data-has-render-dict-area="true"');
    expect(appMarkup).toContain('data-testid="mock-app-route"');
    expect(launcherMarkup).toContain('data-testid="mock-launcher-route"');
  });
});
