/* @vitest-environment jsdom */

import { createAppSubsystemFrontendHost } from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppSubsystemFrontendHostProvider,
  useAppSubsystemFrontendHost,
  useAppSubsystemProjectContext,
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

  return (
    <div>
      <span data-testid="project-config-name">{projectConfig.name}</span>
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

  it("surfaces project context updates and host actions through the provider", async () => {
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
    let listener:
      | ((projectContext: typeof currentProjectContext) => void)
      | null = null;

    const frontendHost = createAppSubsystemFrontendHost({
      closeModal,
      notify,
      getProjectContext: () => currentProjectContext,
      subscribeProjectContext: (nextListener) => {
        listener = nextListener;
        return () => {
          if (listener === nextListener) {
            listener = null;
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

    currentProjectContext = {
      defaultProjectConfigId: "config-b",
      projectMetadata: [{ id: "config-b", name: "Beta" }],
      projectConfig: {
        id: "config-b",
        name: "Beta",
        entryCodeBlockId: "entry-code-block",
      },
    };

    await act(async () => {
      listener?.(currentProjectContext);
    });

    expect(
      hostElement.querySelector('[data-testid="project-config-name"]')
        ?.textContent,
    ).toBe("Beta");

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
