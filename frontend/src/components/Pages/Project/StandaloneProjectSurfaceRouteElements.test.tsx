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
  StandaloneProjectSurfacePage: () => (
    <div data-testid="mock-standalone-project-surface-page" />
  ),
}));

vi.mock("./ShareStandaloneProjectSurfacePage", () => ({
  ShareStandaloneProjectSurfacePage: () => (
    <div data-testid="mock-share-standalone-project-surface-page" />
  ),
}));

describe("IdeStandaloneProjectSurfaceRouteElement", () => {
  it("wraps the standalone project surface in the shared ide route shell", () => {
    const markup = renderToStaticMarkup(
      <IdeStandaloneProjectSurfaceRouteElement />,
    );

    expect(markup).toContain('data-testid="mock-global-wrapper"');
    expect(markup).toContain('data-testid="mock-modal-container"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page"',
    );
  });
});

describe("buildStandaloneProjectSurfaceRouteElements", () => {
  it("reuses the lifted standalone/share entrypoints while preserving app and launcher routes", () => {
    const routeElements = buildStandaloneProjectSurfaceRouteElements({
      app: <div data-testid="mock-app-route" />,
      launcher: <div data-testid="mock-launcher-route" />,
    });

    const ideMarkup = renderToStaticMarkup(<>{routeElements.ide}</>);
    const shareMarkup = renderToStaticMarkup(<>{routeElements.share}</>);
    const appMarkup = renderToStaticMarkup(<>{routeElements.app}</>);
    const launcherMarkup = renderToStaticMarkup(<>{routeElements.launcher}</>);

    expect(ideMarkup).toContain('data-testid="mock-global-wrapper"');
    expect(shareMarkup).toContain(
      'data-testid="mock-share-standalone-project-surface-page"',
    );
    expect(appMarkup).toContain('data-testid="mock-app-route"');
    expect(launcherMarkup).toContain('data-testid="mock-launcher-route"');
  });
});
