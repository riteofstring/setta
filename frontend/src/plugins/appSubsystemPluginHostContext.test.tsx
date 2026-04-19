/* @vitest-environment jsdom */

import { createAppSubsystemFrontendHost } from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppSubsystemFrontendHostProvider,
  useAppSubsystemFrontendHost,
  useAppSubsystemProjectContext,
  useAppSubsystemRuntimeContext,
} from "../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemFrontendHostContext";

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
  const runtimeContext = useAppSubsystemRuntimeContext();

  return (
    <div>
      <span data-testid="project-config-name">{projectConfig.name}</span>
      <span data-testid="deployment-mode">
        {runtimeContext.isAppDeploymentMode ? "app" : "ide"}
      </span>
      <span data-testid="snapshot-mode">
        {runtimeContext.defaultRunSnapshotMode}
      </span>
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
    let listener:
      | ((projectContext: typeof currentProjectContext) => void)
      | null = null;
    let runtimeListener:
      | ((runtimeContext: typeof currentRuntimeContext) => void)
      | null = null;

    const frontendHost = createAppSubsystemFrontendHost({
      closeModal,
      notify,
      getProjectContext: () => currentProjectContext,
      getRuntimeContext: () => currentRuntimeContext,
      subscribeProjectContext: (nextListener) => {
        listener = nextListener;
        return () => {
          if (listener === nextListener) {
            listener = null;
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
      hostElement.querySelector('[data-testid="deployment-mode"]')?.textContent,
    ).toBe("ide");
    expect(
      hostElement.querySelector('[data-testid="snapshot-mode"]')?.textContent,
    ).toBe("ephemeral");

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

    await act(async () => {
      listener?.(currentProjectContext);
      runtimeListener?.(currentRuntimeContext);
    });

    expect(
      hostElement.querySelector('[data-testid="project-config-name"]')
        ?.textContent,
    ).toBe("Beta");
    expect(
      hostElement.querySelector('[data-testid="deployment-mode"]')?.textContent,
    ).toBe("app");
    expect(
      hostElement.querySelector('[data-testid="snapshot-mode"]')?.textContent,
    ).toBe("always");

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
