import type { ReactNode } from "react";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Navigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HOME_ROUTER_PATH } from "utils/constants";
import { buildModeWrappedHomeProjectCatchAllRouteElements } from "./modeWrappedHomeProjectCatchAllRouteElements";

vi.mock("components/AppHeader/Header", () => ({
  HeaderContainer: ({ path }: { path: string }) => (
    <div data-testid="mock-header-container" data-path={path} />
  ),
}));

vi.mock("components/Modals/ModalContainer", () => ({
  ModalContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-modal-container">{children}</div>
  ),
}));

vi.mock("components/Pages/Home/HomePage", () => ({
  HomePage: () => <div data-testid="mock-home-page" />,
}));

vi.mock("components/Pages/Launcher/LauncherHomePage", () => ({
  LauncherHomePage: () => <div data-testid="mock-launcher-home-page" />,
}));

vi.mock("components/Pages/LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
}));

vi.mock("components/Pages/NotFound/NotFound", () => ({
  NotFound: () => <div data-testid="mock-not-found" />,
}));

vi.mock("components/Pages/Share/ShareMainContainer", () => ({
  ShareMainContainer: ({
    doneLoading,
    is404,
  }: {
    doneLoading: boolean;
    is404: boolean;
  }) => (
    <div
      data-testid="mock-share-main-container"
      data-done-loading={String(doneLoading)}
      data-is404={String(is404)}
    />
  ),
}));

vi.mock("components/Pages/Share/ShareWrapper", () => ({
  ShareWrapper: ({
    children,
    mode,
  }: {
    children: ({
      doneLoading,
      is404,
    }: {
      doneLoading: boolean;
      is404: boolean;
    }) => ReactNode;
    mode?: "home";
  }) => (
    <div data-testid="mock-share-wrapper" data-mode={mode ?? "default"}>
      {children({ doneLoading: true, is404: false })}
    </div>
  ),
}));

vi.mock("./GlobalWrapper", () => ({
  GlobalWrapper: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-global-wrapper">{children}</div>
  ),
}));

vi.mock("./Project/MainContainer", () => ({
  MainContainer: () => <div data-testid="mock-main-container" />,
}));

describe("buildModeWrappedHomeProjectCatchAllRouteElements", () => {
  it("owns the lifted home/project/catch-all route-element bundles above router.tsx", () => {
    const routeElements = buildModeWrappedHomeProjectCatchAllRouteElements({
      appRouteElement: <div data-testid="mock-app-route" />,
      launcherHomeRouteElement: <div data-testid="mock-launcher-route" />,
    });

    const ideHomeMarkup = renderToStaticMarkup(
      <>{routeElements.homeRouteElements.ide}</>,
    );
    const shareHomeMarkup = renderToStaticMarkup(
      <>{routeElements.homeRouteElements.share}</>,
    );
    const ideProjectMarkup = renderToStaticMarkup(
      <>{routeElements.projectRouteElements.ide}</>,
    );
    const shareProjectMarkup = renderToStaticMarkup(
      <>{routeElements.projectRouteElements.share}</>,
    );
    const ideCatchAllMarkup = renderToStaticMarkup(
      <>{routeElements.catchAllRouteElements.ide}</>,
    );
    const shareCatchAllMarkup = renderToStaticMarkup(
      <>{routeElements.catchAllRouteElements.share}</>,
    );
    const appHomeMarkup = renderToStaticMarkup(
      <>{routeElements.homeRouteElements.app}</>,
    );
    const launcherHomeMarkup = renderToStaticMarkup(
      <>{routeElements.homeRouteElements.launcher}</>,
    );
    const launcherCatchAllMarkup = renderToStaticMarkup(
      <>{routeElements.catchAllRouteElements.launcher}</>,
    );

    expect(ideHomeMarkup).toContain('data-testid="mock-global-wrapper"');
    expect(ideHomeMarkup).toContain('data-testid="mock-home-page"');
    expect(shareHomeMarkup).toContain('data-testid="mock-share-wrapper"');
    expect(shareHomeMarkup).toContain('data-testid="mock-home-page"');

    expect(ideProjectMarkup).toContain('data-testid="mock-main-container"');
    expect(shareProjectMarkup).toContain(
      'data-testid="mock-share-main-container"',
    );
    expect(shareProjectMarkup).toContain('data-done-loading="true"');

    expect(ideCatchAllMarkup).toContain('data-testid="mock-not-found"');
    expect(shareCatchAllMarkup).toContain('data-testid="mock-not-found"');

    expect(appHomeMarkup).toContain('data-testid="mock-app-route"');
    expect(launcherHomeMarkup).toContain('data-testid="mock-launcher-route"');
    expect(launcherCatchAllMarkup).toContain(
      'data-testid="mock-launcher-route"',
    );

    const launcherProjectRouteElement = routeElements.projectRouteElements
      .launcher;
    expect(isValidElement(launcherProjectRouteElement)).toBe(true);
    if (!isValidElement(launcherProjectRouteElement)) {
      throw new Error("Expected the launcher project route to be a React element");
    }
    expect(launcherProjectRouteElement.type).toBe(Navigate);
    expect(launcherProjectRouteElement.props.to).toBe(HOME_ROUTER_PATH);
    expect(launcherProjectRouteElement.props.replace).toBe(true);
  });
});
