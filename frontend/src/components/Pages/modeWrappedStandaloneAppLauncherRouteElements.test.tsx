import type { ReactNode } from "react";
import { isValidElement, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HOME_ROUTER_PATH } from "utils/constants";
import { describe, expect, it, vi } from "vitest";
import { buildModeWrappedStandaloneAppLauncherRouteElements } from "./modeWrappedStandaloneAppLauncherRouteElements";

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

vi.mock("components/Pages/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-app-shell">{children}</div>
  ),
}));

vi.mock("components/Pages/Launcher/LauncherHomePage", () => ({
  LauncherHomePage: () => <div data-testid="mock-launcher-home-page" />,
}));

vi.mock("components/Pages/LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
}));

vi.mock("./modeWrappedHomeProjectCatchAllRouteElements", () => ({
  ModeWrappedRouteGridContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-route-grid-container">{children}</div>
  ),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ replace, to }: { replace?: boolean; to: string }) => (
      <div
        data-testid="mock-navigate"
        data-replace={String(Boolean(replace))}
        data-to={to}
      />
    ),
  };
});

describe("buildModeWrappedStandaloneAppLauncherRouteElements", () => {
  it("owns the lifted standalone app and launcher route-element seam above router.tsx", () => {
    const routeElements = buildModeWrappedStandaloneAppLauncherRouteElements();
    const launcherHomeMarkup = renderToStaticMarkup(
      <>{routeElements.launcherHomeRouteElement}</>,
    );

    expect(launcherHomeMarkup).toContain('data-testid="mock-app-shell"');
    expect(launcherHomeMarkup).toContain('data-testid="mock-modal-container"');
    expect(launcherHomeMarkup).toContain('data-testid="mock-header-container"');
    expect(launcherHomeMarkup).toContain(`data-path="${HOME_ROUTER_PATH}"`);
    expect(launcherHomeMarkup).toContain(
      'data-testid="mock-route-grid-container"',
    );
    expect(launcherHomeMarkup).toContain(
      'data-testid="mock-launcher-home-page"',
    );

    expect(isValidElement(routeElements.appRouteElement)).toBe(true);
    expect(isValidElement(routeElements.standaloneAppRouteElement)).toBe(true);
    if (
      !isValidElement(routeElements.appRouteElement) ||
      !isValidElement(routeElements.standaloneAppRouteElement)
    ) {
      throw new Error("Expected app route elements to be React elements");
    }
    expect(routeElements.appRouteElement.type).toBe(Suspense);
    expect(routeElements.standaloneAppRouteElement).toBe(
      routeElements.appRouteElement,
    );
  });

  it("keeps the standalone launcher route redirect logic in the lifted helper", () => {
    const withProjectMarkup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/Project Space"]}>
        <Routes>
          <Route
            path="/:projectConfigName"
            element={
              buildModeWrappedStandaloneAppLauncherRouteElements()
                .standaloneLauncherRouteElement
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const withoutProjectMarkup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              buildModeWrappedStandaloneAppLauncherRouteElements()
                .standaloneLauncherRouteElement
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(withProjectMarkup).toContain('data-testid="mock-navigate"');
    expect(withProjectMarkup).toContain('data-replace="true"');
    expect(withProjectMarkup).toContain('data-to="/Project%20Space"');

    expect(withoutProjectMarkup).toContain('data-testid="mock-navigate"');
    expect(withoutProjectMarkup).toContain('data-replace="true"');
    expect(withoutProjectMarkup).toContain(`data-to="${HOME_ROUTER_PATH}"`);
  });
});
