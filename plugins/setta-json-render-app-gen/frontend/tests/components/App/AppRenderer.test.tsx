import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAppSubsystemFrontendHost,
  createPolicy,
  createProjectConfig,
  createSectionCapabilities,
  createSingletonSections,
  type Policy,
} from "@setta/app-subsystem-frontend-sdk";
import { createAppDefinition } from "../../../src/appSubsystemContracts";
import { AppSubsystemFrontendHostProvider } from "../../../src/appSubsystemFrontendHostContext";
import { useAppConfigs } from "../../../src/appSubsystemProjectState";
import { resetAppSubsystemPluginStores } from "../../testUtils/appSubsystemTestState";

import { AppRenderer } from "../../../src/components/App/AppRenderer";

const notifyMock = vi.hoisted(() => vi.fn());
const runCodeMock = vi.hoisted(() => vi.fn());
const callOpenAPIMock = vi.hoisted(() =>
  vi.fn((promise: Promise<unknown>) => promise),
);
let latestHandlers: Record<
  string,
  (params?: Record<string, unknown>) => void | Promise<void>
> = {};

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: callOpenAPIMock,
    runCode: runCodeMock,
  };
});

vi.mock("@json-render/react", async () => {
  const React = await import("react");
  const { useAppActionState } = await import(
    "../../../src/components/App/appContext"
  );

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
    appPolicy?: Policy | null;
    appDefinition?: ReturnType<typeof createAppDefinition> | null;
    defaultConfigId?: string | null;
    shareSessionId?: string | null;
  } = {},
) {
  const {
    appPolicy = null,
    appDefinition = null,
    defaultConfigId = null,
    shareSessionId = null,
  } = options;

  const baseFrontendHost = createAppSubsystemFrontendHost();
  const frontendHost = createAppSubsystemFrontendHost({
    getRuntimeContext: () => ({
      ...baseFrontendHost.getRuntimeContext(),
      isAppDeploymentMode: Boolean(shareSessionId),
      shareSessionId,
    }),
    notify: notifyMock,
  });
  return renderToStaticMarkup(
    <AppSubsystemFrontendHostProvider host={frontendHost}>
      <AppRenderer
        appSpec={appSpec}
        appDefinition={appDefinition}
        appPolicy={appPolicy}
        defaultConfigId={defaultConfigId}
      />
    </AppSubsystemFrontendHostProvider>,
  );
}

describe("AppRenderer", () => {
  beforeEach(() => {
    resetAppSubsystemPluginStores();
    notifyMock.mockReset();
    callOpenAPIMock.mockClear();
    runCodeMock.mockReset();
    latestHandlers = {};
  });

  afterEach(() => {
    resetAppSubsystemPluginStores();
    vi.restoreAllMocks();
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
    const policy = createPolicy({ allowRun: false });
    const markup = renderApp(appSpec, { appPolicy: policy });

    expect(markup).toContain('data-can-run="false"');
    expect(markup).toContain("Runs are disabled by policy.");
  });

  it("exports action state through the app context", () => {
    const appSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const policy = createPolicy({ allowRun: true });
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
    const policy = createPolicy({
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
          sectionCapabilities: {
            [sectionId]: createSectionCapabilities({
              canRun: true,
              runRequestSectionId: sectionId,
            }),
          },
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

    runCodeMock.mockResolvedValue({
      data: null,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    renderApp(appSpec, {
      appDefinition,
      appPolicy: policy,
      defaultConfigId: "fallback-config",
    });

    const handler = latestHandlers.runCustom;
    expect(handler).toBeDefined();
    await handler?.();

    expect(runCodeMock).toHaveBeenCalledWith({
      body: {
        cliId: "",
        drawSnapshotsBySectionId: {},
        paramOverrides: { [`${sectionId}:param-1`]: "override" },
        projectConfigId: configId,
        runSnapshotMode: "ephemeral",
        sectionId,
        sectionVariantOverrides: { [sectionId]: "variant-2" },
        terminalSectionId: "",
      },
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
    const policy = createPolicy({
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
          sectionCapabilities: {
            [sectionId]: createSectionCapabilities({
              canRun: true,
              runRequestSectionId: sectionId,
            }),
          },
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

    expect(runCodeMock).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith({
      message: "Invalid paramOverrides (expected object of string -> string).",
    });
  });

  it("uses the generated binary download helper for app actions", async () => {
    const contentId = "0123456789abcdef";
    const shareSessionId = "share-session-a";
    const filename = "report.bin";
    const appSpec = {
      root: {
        key: "root",
        type: "ActionButton",
        props: { label: "Download", action: "downloadBinaryAction" },
      },
      elements: {},
    };
    const appDefinition = createAppDefinition({
      actions: {
        downloadBinaryAction: {
          type: "downloadBinary",
          contentId,
          filename,
        },
      },
    });
    const policy = createPolicy({ allowFileDownloads: true });
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost:3000",
      pretendToBeVisual: true,
    });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousLocation = globalThis.location;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousHTMLAnchorElement = globalThis.HTMLAnchorElement;
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const previousReactActEnvironment = Reflect.get(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
    );

    Reflect.set(globalThis, "window", dom.window);
    Reflect.set(globalThis, "document", dom.window.document);
    Reflect.set(globalThis, "location", dom.window.location);
    Reflect.set(globalThis, "HTMLElement", dom.window.HTMLElement);
    Reflect.set(globalThis, "HTMLAnchorElement", dom.window.HTMLAnchorElement);
    Reflect.set(
      globalThis,
      "requestAnimationFrame",
      dom.window.requestAnimationFrame.bind(dom.window),
    );
    Reflect.set(
      globalThis,
      "cancelAnimationFrame",
      dom.window.cancelAnimationFrame.bind(dom.window),
    );
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

    let root: ReturnType<typeof createRoot> | null = null;
    try {
      const host = document.createElement("div");
      root = createRoot(host);
      const baseFrontendHost = createAppSubsystemFrontendHost();
      const frontendHost = createAppSubsystemFrontendHost({
        getRuntimeContext: () => ({
          ...baseFrontendHost.getRuntimeContext(),
          isAppDeploymentMode: true,
          shareSessionId,
        }),
        notify: notifyMock,
      });

      await act(async () => {
        root?.render(
          <AppSubsystemFrontendHostProvider host={frontendHost}>
            <AppRenderer
              appSpec={appSpec}
              appDefinition={appDefinition}
              appPolicy={policy}
            />
          </AppSubsystemFrontendHostProvider>,
        );
      });

      const appendSpy = vi.spyOn(document.body, "appendChild");
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      const handler = latestHandlers.downloadBinaryAction;
      expect(handler).toBeDefined();
      await handler?.();

      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);

      const downloadElement = appendSpy.mock.calls[0]?.[0];
      expect(downloadElement).toBeInstanceOf(HTMLAnchorElement);
      if (!(downloadElement instanceof HTMLAnchorElement)) {
        throw new Error("expected HTMLAnchorElement download trigger");
      }

      // Anchor-triggered downloads have to carry shareSessionId on the URL.
      const downloadURL = new URL(downloadElement.href);
      expect(downloadURL.pathname).toBe(`/binary/${contentId}`);
      expect(downloadURL.searchParams.get("shareSessionId")).toBe(
        shareSessionId,
      );
      expect(downloadElement.download).toBe(filename);
      expect(downloadElement.rel).toBe("noopener");
      expect(document.body.querySelectorAll("a")).toHaveLength(0);
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Reflect.set(globalThis, "window", previousWindow);
      }
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Reflect.set(globalThis, "document", previousDocument);
      }
      if (previousLocation === undefined) {
        Reflect.deleteProperty(globalThis, "location");
      } else {
        Reflect.set(globalThis, "location", previousLocation);
      }
      if (previousHTMLElement === undefined) {
        Reflect.deleteProperty(globalThis, "HTMLElement");
      } else {
        Reflect.set(globalThis, "HTMLElement", previousHTMLElement);
      }
      if (previousHTMLAnchorElement === undefined) {
        Reflect.deleteProperty(globalThis, "HTMLAnchorElement");
      } else {
        Reflect.set(globalThis, "HTMLAnchorElement", previousHTMLAnchorElement);
      }
      if (previousRequestAnimationFrame === undefined) {
        Reflect.deleteProperty(globalThis, "requestAnimationFrame");
      } else {
        Reflect.set(
          globalThis,
          "requestAnimationFrame",
          previousRequestAnimationFrame,
        );
      }
      if (previousCancelAnimationFrame === undefined) {
        Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
      } else {
        Reflect.set(
          globalThis,
          "cancelAnimationFrame",
          previousCancelAnimationFrame,
        );
      }
      if (previousReactActEnvironment === undefined) {
        Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
      } else {
        Reflect.set(
          globalThis,
          "IS_REACT_ACT_ENVIRONMENT",
          previousReactActEnvironment,
        );
      }
    }
  });
});
