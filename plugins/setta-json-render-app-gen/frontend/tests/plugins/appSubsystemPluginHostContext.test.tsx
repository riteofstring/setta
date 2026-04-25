/* @vitest-environment jsdom */

import {
  createAppSubsystemFrontendHost,
  createSingleConfig,
  type AppSubsystemProjectStateSnapshot,
} from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppSubsystemFrontendHostProvider,
  useAppSubsystemFrontendHost,
  useAppSubsystemProjectContext,
  useAppSubsystemProjectStateSnapshot,
  useAppSubsystemRuntimeContext,
  useAppSubsystemServerModeState,
} from "../../src/appSubsystemFrontendHostContext";

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

function setReactActEnvironment(value: boolean | undefined) {
  const target = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (value === undefined) {
    delete target.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  target.IS_REACT_ACT_ENVIRONMENT = value;
}

function HostContextProbe() {
  const frontendHost = useAppSubsystemFrontendHost();
  const { projectConfig } = useAppSubsystemProjectContext();
  const projectState = useAppSubsystemProjectStateSnapshot();
  const runtimeContext = useAppSubsystemRuntimeContext();
  const serverModeState = useAppSubsystemServerModeState();

  return (
    <div>
      <span data-testid="project-config-name">{projectConfig.name}</span>
      <span data-testid="project-state-config-id">
        {projectState.projectConfig.id}
      </span>
      <span data-testid="preview-variant-count">
        {Object.keys(projectState.previewSectionVariantMap).length}
      </span>
      <span data-testid="deployment-mode">
        {runtimeContext.isAppDeploymentMode ? "app" : "ide"}
      </span>
      <span data-testid="snapshot-mode">
        {runtimeContext.defaultRunSnapshotMode}
      </span>
      <span data-testid="server-mode">{serverModeState.mode ?? "unset"}</span>
      <button
        type="button"
        onClick={() =>
          frontendHost.notify({ message: `${projectConfig.name} ready` })
        }
      >
        Notify
      </button>
      <button type="button" onClick={frontendHost.closeModal}>
        Close
      </button>
    </div>
  );
}

describe("AppSubsystemFrontendHostContext", () => {
  let hostElement: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.body.innerHTML = "";
    hostElement = document.createElement("div");
    document.body.appendChild(hostElement);
    root = createRoot(hostElement);
    setReactActEnvironment(true);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = "";
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("surfaces project and runtime context updates plus host actions through the provider", async () => {
    const closeModal = vi.fn();
    const notify = vi.fn();
    let currentProjectContext = {
      defaultProjectConfigId: "config-a",
      projectMetadata: [{ id: "config-a", name: "Alpha" }],
      projectConfig: {
        id: "config-a",
        name: "Alpha",
        entryCodeBlockId: null,
      },
    };
    let currentRuntimeContext = {
      isAppDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      defaultRunSnapshotMode: "ephemeral" as const,
      runSnapshotModeByProjectConfigId: {},
    };
    let currentProjectState = {
      projectConfig: {
        id: "config-a",
        name: "Alpha",
        entryCodeBlockId: null,
      },
      previewSectionVariantMap: {
        "section-a": "variant-a",
      },
    };
    let currentServerModeState = {
      mode: "ide" as const,
      modeResolved: true,
      modeError: null,
    };
    const buildProjectStateSnapshot = (): AppSubsystemProjectStateSnapshot => ({
      ...createSingleConfig({
        projectConfig: currentProjectState.projectConfig,
      }),
      previewSectionVariantMap: currentProjectState.previewSectionVariantMap,
    });
    let listener:
      | ((projectContext: typeof currentProjectContext) => void)
      | null = null;
    let projectStateListener:
      | ((projectState: AppSubsystemProjectStateSnapshot) => void)
      | null = null;
    let runtimeListener:
      | ((runtimeContext: typeof currentRuntimeContext) => void)
      | null = null;
    let serverModeListener:
      | ((serverModeState: typeof currentServerModeState) => void)
      | null = null;

    const frontendHost = createAppSubsystemFrontendHost({
      closeModal,
      notify,
      getProjectContext: () => currentProjectContext,
      getProjectStateSnapshot: buildProjectStateSnapshot,
      getRuntimeContext: () => currentRuntimeContext,
      getServerModeState: () => currentServerModeState,
      subscribeProjectContext: (nextListener) => {
        listener = nextListener;
        return () => {
          if (listener === nextListener) {
            listener = null;
          }
        };
      },
      subscribeProjectStateSnapshot: (nextListener) => {
        projectStateListener = nextListener;
        return () => {
          if (projectStateListener === nextListener) {
            projectStateListener = null;
          }
        };
      },
      subscribeRuntimeContext: (nextListener) => {
        runtimeListener = nextListener;
        return () => {
          if (runtimeListener === nextListener) {
            runtimeListener = null;
          }
        };
      },
      subscribeServerModeState: (nextListener) => {
        serverModeListener = nextListener;
        return () => {
          if (serverModeListener === nextListener) {
            serverModeListener = null;
          }
        };
      },
    });

    await act(async () => {
      root.render(
        <AppSubsystemFrontendHostProvider host={frontendHost}>
          <HostContextProbe />
        </AppSubsystemFrontendHostProvider>,
      );
    });

    expect(
      hostElement.querySelector('[data-testid="project-config-name"]')
        ?.textContent,
    ).toBe("Alpha");
    expect(
      hostElement.querySelector('[data-testid="project-state-config-id"]')
        ?.textContent,
    ).toBe("config-a");
    expect(
      hostElement.querySelector('[data-testid="preview-variant-count"]')
        ?.textContent,
    ).toBe("1");
    expect(
      hostElement.querySelector('[data-testid="deployment-mode"]')?.textContent,
    ).toBe("ide");
    expect(
      hostElement.querySelector('[data-testid="snapshot-mode"]')?.textContent,
    ).toBe("ephemeral");
    expect(
      hostElement.querySelector('[data-testid="server-mode"]')?.textContent,
    ).toBe("ide");

    currentProjectContext = {
      defaultProjectConfigId: "config-b",
      projectMetadata: [{ id: "config-b", name: "Beta" }],
      projectConfig: {
        id: "config-b",
        name: "Beta",
        entryCodeBlockId: "entry-code-block",
      },
    };
    currentRuntimeContext = {
      isAppDeploymentMode: true,
      shareSessionId: "share-session",
      sessionRunCount: 2,
      sharePolicy: null,
      defaultRunSnapshotMode: "always",
      runSnapshotModeByProjectConfigId: {
        "config-b": "never",
      },
    };
    currentProjectState = {
      projectConfig: {
        id: "config-b",
        name: "Beta",
        entryCodeBlockId: "entry-code-block",
      },
      previewSectionVariantMap: {},
    };
    currentServerModeState = {
      mode: "app",
      modeResolved: true,
      modeError: null,
    };

    await act(async () => {
      listener?.(currentProjectContext);
      projectStateListener?.(buildProjectStateSnapshot());
      runtimeListener?.(currentRuntimeContext);
      serverModeListener?.(currentServerModeState);
    });

    expect(
      hostElement.querySelector('[data-testid="project-config-name"]')
        ?.textContent,
    ).toBe("Beta");
    expect(
      hostElement.querySelector('[data-testid="project-state-config-id"]')
        ?.textContent,
    ).toBe("config-b");
    expect(
      hostElement.querySelector('[data-testid="preview-variant-count"]')
        ?.textContent,
    ).toBe("0");
    expect(
      hostElement.querySelector('[data-testid="deployment-mode"]')?.textContent,
    ).toBe("app");
    expect(
      hostElement.querySelector('[data-testid="snapshot-mode"]')?.textContent,
    ).toBe("always");
    expect(
      hostElement.querySelector('[data-testid="server-mode"]')?.textContent,
    ).toBe("app");

    await act(async () => {
      hostElement
        .querySelectorAll("button")[0]
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      hostElement
        .querySelectorAll("button")[1]
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(notify).toHaveBeenCalledWith({ message: "Beta ready" });
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});
