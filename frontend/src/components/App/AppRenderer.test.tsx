import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppConfigs, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import * as endpoints from "utils/generatedEndpoints";
import type { SharePolicy } from "utils/generatedTypes";
import {
  createAppDefinition,
  createProjectConfig,
  createSharePolicy,
  createSingletonSections,
} from "utils/generatedTypes";

import { AppRenderer } from "./AppRenderer";

let latestHandlers: Record<
  string,
  (params?: Record<string, unknown>) => void | Promise<void>
> = {};

vi.mock("@json-render/react", async () => {
  const React = await import("react");
  const { useAppActionState } = await import("./appContext");

  const Passthrough = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const ActionProvider = ({
    handlers,
    children,
  }: {
    handlers: Record<string, (params?: Record<string, unknown>) => void>;
    children: React.ReactNode;
  }) => {
    latestHandlers = handlers;
    return React.createElement(React.Fragment, null, children);
  };

  const Renderer = () => {
    const { canRun, runDisabledReason, isRunning } = useAppActionState();
    return React.createElement("div", {
      "data-can-run": String(canRun),
      "data-disabled-reason": runDisabledReason ?? "",
      "data-is-running": String(isRunning),
    });
  };

  return {
    ActionProvider,
    DataProvider: Passthrough,
    VisibilityProvider: Passthrough,
    Renderer,
  };
});

function renderApp(
  appSpec: unknown | null,
  options: {
    appPolicy?: SharePolicy | null;
    appDefinition?: ReturnType<typeof createAppDefinition> | null;
    defaultConfigId?: string | null;
  } = {},
) {
  const {
    appPolicy = null,
    appDefinition = null,
    defaultConfigId = null,
  } = options;
  useShareSession.setState({
    isDeploymentMode: false,
    sharePolicy: null,
    shareSessionId: null,
    sessionRunCount: 0,
    shareDeploymentName: null,
    shareDeploymentVersion: null,
    deploymentMode: null,
  });

  return renderToStaticMarkup(
    <AppRenderer
      appSpec={appSpec}
      appDefinition={appDefinition}
      appPolicy={appPolicy}
      defaultConfigId={defaultConfigId}
    />,
  );
}

describe("AppRenderer", () => {
  beforeEach(() => {
    resetProjectStores();
    latestHandlers = {};
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows empty state when no app spec is present", () => {
    const markup = renderApp(null, {});

    expect(markup).toContain("No app spec found");
  });

  it("uses policy to disable runs", () => {
    const appSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const policy = createSharePolicy({ allowRun: false });
    const markup = renderApp(appSpec, { appPolicy: policy });

    expect(markup).toContain('data-can-run="false"');
    expect(markup).toContain("Runs are disabled by policy.");
  });

  it("exports action state through the app context", () => {
    const appSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const policy = createSharePolicy({ allowRun: true });
    const markup = renderApp(appSpec, { appPolicy: policy });

    expect(markup).toContain('data-can-run="true"');
    expect(markup).toContain('data-is-running="false"');
  });

  it("applies run action overrides", async () => {
    const configId = "config-a";
    const sectionId = "section-1";
    const appSpec = {
      root: {
        key: "root",
        type: "ActionButton",
        props: { label: "Run", action: "runCustom" },
      },
      elements: {},
    };
    const appDefinition = createAppDefinition({
      actions: {
        runCustom: {
          type: "run",
          configId,
          sectionId,
          paramOverrides: {
            [`${sectionId}:param-1`]: "override",
          },
          sectionVariantOverrides: {
            [sectionId]: "variant-2",
          },
        },
      },
    });
    const policy = createSharePolicy({
      allowParamChanges: true,
      allowVariantChanges: true,
      allowRun: true,
    });

    useAppConfigs.setState({
      configs: {
        [configId]: {
          projectConfig: createProjectConfig({ id: configId }),
          sections: {},
          sectionVariants: {},
          sectionImpls: {},
          codeObjs: {},
          codeObjVariants: {},
          codeObjImpls: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: {},
          shownParamIds: {},
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
          genCodeBinding: null,
        },
      },
    });

    const runSpy = vi
      .spyOn(endpoints, "route_run_code")
      .mockResolvedValue({ data: null, status: 200, hasResponse: true });
    const setParamSpy = vi.spyOn(endpoints, "route_set_param_entered_value");
    const setVariantSpy = vi.spyOn(endpoints, "route_set_section_variant");

    renderApp(appSpec, {
      appDefinition,
      appPolicy: policy,
      defaultConfigId: "fallback-config",
    });

    const handler = latestHandlers.runCustom;
    expect(handler).toBeDefined();
    await handler?.();

    expect(setVariantSpy).not.toHaveBeenCalled();
    expect(setParamSpy).not.toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith({
      projectConfigId: configId,
      sectionId,
      sectionVariantOverrides: { [sectionId]: "variant-2" },
      paramOverrides: { [`${sectionId}:param-1`]: "override" },
    });
  });

  it("rejects invalid paramOverrides shape", async () => {
    const configId = "config-a";
    const sectionId = "section-1";
    const appSpec = {
      root: {
        key: "root",
        type: "ActionButton",
        props: { label: "Run", action: "runCustom" },
      },
      elements: {},
    };
    const appDefinition = createAppDefinition({
      actions: {
        runCustom: {
          type: "run",
          configId,
          sectionId,
        },
      },
    });
    const policy = createSharePolicy({
      allowParamChanges: true,
      allowVariantChanges: true,
      allowRun: true,
    });

    useAppConfigs.setState({
      configs: {
        [configId]: {
          projectConfig: createProjectConfig({ id: configId }),
          sections: {},
          sectionVariants: {},
          sectionImpls: {},
          codeObjs: {},
          codeObjVariants: {},
          codeObjImpls: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: {},
          shownParamIds: {},
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
          genCodeBinding: null,
        },
      },
    });

    const runSpy = vi.spyOn(endpoints, "route_run_code");

    renderApp(appSpec, {
      appDefinition,
      appPolicy: policy,
      defaultConfigId: "fallback-config",
    });

    const handler = latestHandlers.runCustom;
    expect(handler).toBeDefined();
    await handler?.({
      configId,
      sectionId,
      paramOverrides: [],
    });

    expect(runSpy).not.toHaveBeenCalled();
  });
});
