import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildStandaloneProjectSurfaceRouteElements,
  IdeStandaloneProjectSurfaceRouteElement,
} from "./StandaloneProjectSurfaceRouteElements";

vi.mock("components/Modals/ModalContainer", () => ({
  ModalContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-modal-container">{children}</div>
  ),
}));

vi.mock("../GlobalWrapper", () => ({
  GlobalWrapper: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-global-wrapper">{children}</div>
  ),
}));

vi.mock("./StandaloneProjectSurfacePage", () => ({
  StandaloneProjectSurfacePage: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-page"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

vi.mock("./ShareStandaloneProjectSurfacePage", () => ({
  ShareStandaloneProjectSurfacePage: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-share-standalone-project-surface-page"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

describe("IdeStandaloneProjectSurfaceRouteElement", () => {
  it("wraps the standalone project surface in the shared ide route shell while reusing the caller-owned dict-area renderer seam", () => {
    const markup = renderToStaticMarkup(
      <IdeStandaloneProjectSurfaceRouteElement renderDictArea={() => null} />,
    );

    expect(markup).toContain('data-testid="mock-global-wrapper"');
    expect(markup).toContain('data-testid="mock-modal-container"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page"',
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
  });
});

describe("buildStandaloneProjectSurfaceRouteElements", () => {
  it("reuses the lifted standalone/share entrypoints while preserving the caller-owned dict-area renderer seam plus app and launcher routes", () => {
    const routeElements = buildStandaloneProjectSurfaceRouteElements({
      app: <div data-testid="mock-app-route" />,
      launcher: <div data-testid="mock-launcher-route" />,
      renderDictArea: () => null,
    });

    const ideMarkup = renderToStaticMarkup(<>{routeElements.ide}</>);
    const shareMarkup = renderToStaticMarkup(<>{routeElements.share}</>);
    const appMarkup = renderToStaticMarkup(<>{routeElements.app}</>);
    const launcherMarkup = renderToStaticMarkup(<>{routeElements.launcher}</>);

    expect(ideMarkup).toContain('data-testid="mock-global-wrapper"');
    expect(ideMarkup).toContain('data-has-render-dict-area="true"');
    expect(shareMarkup).toContain(
      'data-testid="mock-share-standalone-project-surface-page"',
    );
    expect(shareMarkup).toContain('data-has-render-dict-area="true"');
    expect(appMarkup).toContain('data-testid="mock-app-route"');
    expect(launcherMarkup).toContain('data-testid="mock-launcher-route"');
  });
});
