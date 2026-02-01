import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStores } from "state/utils";
import { useProjectState, useShareSession } from "state/definitions";
import { createProjectConfig, createSharePolicy } from "utils/generatedTypes";
import type { SharePolicy } from "utils/generatedTypes";

import { AppRenderer } from "./AppRenderer";

vi.mock("@json-render/react", async () => {
  const React = await import("react");
  const { useAppActionState } = await import("./appContext");

  const Passthrough = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const Renderer = () => {
    const { canRun, runDisabledReason, isRunning } = useAppActionState();
    return React.createElement("div", {
      "data-can-run": String(canRun),
      "data-disabled-reason": runDisabledReason ?? "",
      "data-is-running": String(isRunning),
    });
  };

  return {
    ActionProvider: Passthrough,
    DataProvider: Passthrough,
    VisibilityProvider: Passthrough,
    Renderer,
  };
});

function renderApp(
  appSpec: unknown | null,
  appPolicy: SharePolicy | null = null,
) {
  const projectConfig = createProjectConfig({ id: "project-1" });
  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = {};
    state.sectionVariants = {};
    state.sectionImpls = {};
    state.previewSectionVariantMap = {};
  });
  useShareSession.setState({
    isShareMode: false,
    sharePolicy: null,
    shareSessionId: null,
    shareDeploymentName: null,
    shareDeploymentVersion: null,
    deploymentMode: null,
  });

  return renderToStaticMarkup(
    <AppRenderer appSpec={appSpec} appConfig={null} appPolicy={appPolicy} />,
  );
}

describe("AppRenderer", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows empty state when no app spec is present", () => {
    const markup = renderApp(null);

    expect(markup).toContain("No app spec found");
  });

  it("uses policy to disable runs", () => {
    const appSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const policy = createSharePolicy({ allowRun: false });
    const markup = renderApp(appSpec, policy);

    expect(markup).toContain('data-can-run="false"');
    expect(markup).toContain("Runs are disabled by policy.");
  });

  it("exports action state through the app context", () => {
    const appSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const policy = createSharePolicy({ allowRun: true });
    const markup = renderApp(appSpec, policy);

    expect(markup).toContain('data-can-run="true"');
    expect(markup).toContain('data-is-running="false"');
  });
});
