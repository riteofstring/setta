import type { ReactNode } from "react";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HOME_ROUTER_PATH } from "utils/constants";
import { buildModeWrappedIndexWorkspaceLaunchRouteElements } from "./modeWrappedIndexWorkspaceLaunchRouteElements";

const mockedSettingsState = {
  backend: {
    showDefaultConfigOnLoad: true,
  },
};

const mockedProjectMetadataState = {
  defaultProjectConfigId: "project-a",
  projectMetadata: [
    { id: "project-a", name: "Project A" },
    { id: "project-b", name: "Project B" },
  ],
};

vi.mock("components/Pages/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-app-shell">{children}</div>
  ),
}));

vi.mock("components/Pages/Launch/WorkspaceLaunchPage", () => ({
  WorkspaceLaunchPage: () => <div data-testid="mock-workspace-launch-page" />,
}));

vi.mock("components/Pages/LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
}));

vi.mock("components/Pages/NotFound/NotFound", () => ({
  NotFound: () => <div data-testid="mock-not-found" />,
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

vi.mock("state/definitions", () => ({
  useAllProjectMetadata: (
    selector: (state: typeof mockedProjectMetadataState) => unknown,
  ) => selector(mockedProjectMetadataState),
  useSettings: (selector: (state: typeof mockedSettingsState) => unknown) =>
    selector(mockedSettingsState),
}));

vi.mock("./GlobalWrapper", () => ({
  GlobalWrapper: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-global-wrapper">{children}</div>
  ),
  IndexRouteComponent: () => <div data-testid="mock-index-route-component" />,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({
      replace,
      to,
    }: {
      replace?: boolean;
      to: string;
    }) => (
      <div
        data-testid="mock-navigate"
        data-replace={String(Boolean(replace))}
        data-to={to}
      />
    ),
  };
});

describe("buildModeWrappedIndexWorkspaceLaunchRouteElements", () => {
  it("owns the lifted index/workspace-launch/share-index route-element bundles above router.tsx", () => {
    const routeElements = buildModeWrappedIndexWorkspaceLaunchRouteElements({
      appRouteElement: <div data-testid="mock-app-route" />,
      launcherHomeRouteElement: <div data-testid="mock-launcher-route" />,
    });

    const ideIndexMarkup = renderToStaticMarkup(
      <>{routeElements.indexRouteElements.ide}</>,
    );
    const shareIndexMarkup = renderToStaticMarkup(
      <>{routeElements.indexRouteElements.share}</>,
    );
    const appIndexMarkup = renderToStaticMarkup(
      <>{routeElements.indexRouteElements.app}</>,
    );
    const launcherIndexMarkup = renderToStaticMarkup(
      <>{routeElements.indexRouteElements.launcher}</>,
    );
    const ideWorkspaceLaunchMarkup = renderToStaticMarkup(
      <>{routeElements.workspaceLaunchRouteElements.ide}</>,
    );
    const launcherWorkspaceLaunchMarkup = renderToStaticMarkup(
      <>{routeElements.workspaceLaunchRouteElements.launcher}</>,
    );

    expect(ideIndexMarkup).toContain('data-testid="mock-global-wrapper"');
    expect(ideIndexMarkup).toContain(
      'data-testid="mock-index-route-component"',
    );
    expect(shareIndexMarkup).toContain('data-testid="mock-share-wrapper"');
    expect(shareIndexMarkup).toContain('data-testid="mock-navigate"');
    expect(shareIndexMarkup).toContain('data-to="Project A"');
    expect(appIndexMarkup).toContain('data-testid="mock-app-route"');
    expect(launcherIndexMarkup).toContain('data-testid="mock-launcher-route"');

    expect(ideWorkspaceLaunchMarkup).toContain(
      'data-testid="mock-global-wrapper"',
    );
    expect(ideWorkspaceLaunchMarkup).toContain(
      'data-testid="mock-workspace-launch-page"',
    );
    expect(launcherWorkspaceLaunchMarkup).toContain(
      'data-testid="mock-app-shell"',
    );
    expect(launcherWorkspaceLaunchMarkup).toContain(
      'data-testid="mock-workspace-launch-page"',
    );

    const shareWorkspaceLaunchElement =
      routeElements.workspaceLaunchRouteElements.share;
    const appWorkspaceLaunchElement =
      routeElements.workspaceLaunchRouteElements.app;

    expect(isValidElement(shareWorkspaceLaunchElement)).toBe(true);
    expect(isValidElement(appWorkspaceLaunchElement)).toBe(true);
    if (
      !isValidElement(shareWorkspaceLaunchElement) ||
      !isValidElement(appWorkspaceLaunchElement)
    ) {
      throw new Error("Expected blocked workspace-launch routes to be elements");
    }
    expect(shareWorkspaceLaunchElement.props.to).toBe(HOME_ROUTER_PATH);
    expect(shareWorkspaceLaunchElement.props.replace).toBe(true);
    expect(appWorkspaceLaunchElement.props.to).toBe(HOME_ROUTER_PATH);
    expect(appWorkspaceLaunchElement.props.replace).toBe(true);
  });

  it("falls back to home on share index when the default project should not auto-open", () => {
    mockedSettingsState.backend.showDefaultConfigOnLoad = false;

    const routeElements = buildModeWrappedIndexWorkspaceLaunchRouteElements({
      appRouteElement: <div data-testid="mock-app-route" />,
      launcherHomeRouteElement: <div data-testid="mock-launcher-route" />,
    });

    const shareIndexMarkup = renderToStaticMarkup(
      <>{routeElements.indexRouteElements.share}</>,
    );

    expect(shareIndexMarkup).toContain('data-testid="mock-share-wrapper"');
    expect(shareIndexMarkup).toContain(`data-to="${HOME_ROUTER_PATH}"`);
    expect(shareIndexMarkup).toContain('data-replace="true"');

    mockedSettingsState.backend.showDefaultConfigOnLoad = true;
  });
});
