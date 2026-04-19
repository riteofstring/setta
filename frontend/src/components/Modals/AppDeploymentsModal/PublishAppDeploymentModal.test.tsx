/* @vitest-environment jsdom */

import * as Dialog from "@radix-ui/react-dialog";
import {
  checkIfFileExists,
  createAppSubsystemFrontendHost,
  type AppSubsystemProjectContext,
} from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "testUtils/reactRefreshPreamble";
import { createAppDefinition } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemContracts";
import { useAppDefinition } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemDefinitionState";
import { AppSubsystemFrontendHostProvider } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemFrontendHostContext";

const openAPI = vi.hoisted(() => ({
  checkIfFileExists: vi.fn(),
  listAppDeployments: vi.fn(),
  publishAppDeployment: vi.fn(),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async () => {
  const actual = await vi.importActual<
    typeof import("@setta/app-subsystem-frontend-sdk")
  >("@setta/app-subsystem-frontend-sdk");
  return {
    ...actual,
    checkIfFileExists: openAPI.checkIfFileExists,
    listAppDeployments: openAPI.listAppDeployments,
    publishAppDeployment: openAPI.publishAppDeployment,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

import { PublishAppDeploymentModal } from "../../../../../plugins/setta-json-render-app-gen/frontend/src/components/Modals/AppDeploymentsModal/PublishAppDeploymentModal";

type RenderedModal = {
  host: HTMLDivElement;
  root: Root;
};

const listenerEntrypointStorageKey =
  "setta.publishAppDeployment.listenerEntrypoint";
const originalLocalStorage = window.localStorage;
const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const closeModal = vi.fn();
const notify = vi.fn();

let currentProjectContext: AppSubsystemProjectContext = {
  defaultProjectConfigId: null,
  projectMetadata: [],
  projectConfig: {
    id: "project-1",
    name: "Project One",
    entryCodeBlockId: null,
  },
};

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

function installTestLocalStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (name: string) => storage.get(name) ?? null,
      setItem: (name: string, value: string) => {
        storage.set(name, value);
      },
      removeItem: (name: string) => {
        storage.delete(name);
      },
    },
  });
}

async function renderModal(): Promise<RenderedModal> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const appSubsystemHost = createAppSubsystemFrontendHost({
    closeModal,
    notify,
    getProjectContext: () => currentProjectContext,
    subscribeProjectContext: () => () => undefined,
  });

  await act(async () => {
    root.render(
      <AppSubsystemFrontendHostProvider host={appSubsystemHost}>
        <Dialog.Root open>
          <Dialog.Content>
            <PublishAppDeploymentModal open />
          </Dialog.Content>
        </Dialog.Root>
      </AppSubsystemFrontendHostProvider>,
    );
  });

  return { host, root };
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await vi.dynamicImportSettled();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("PublishAppDeploymentModal", () => {
  beforeEach(() => {
    installTestLocalStorage();
    document.body.innerHTML = "";
    openAPI.checkIfFileExists.mockReset();
    openAPI.listAppDeployments.mockReset();
    openAPI.publishAppDeployment.mockReset();
    closeModal.mockReset();
    notify.mockReset();
    currentProjectContext = {
      defaultProjectConfigId: null,
      projectMetadata: [],
      projectConfig: {
        id: "project-1",
        name: "Project One",
        entryCodeBlockId: null,
      },
    };
    useAppDefinition.setState({
      appSpec: null,
      appDefinition: createAppDefinition(),
    });
    setReactActEnvironment(true);
  });

  afterEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    document.body.innerHTML = "";
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("autofills the listener entrypoint through the Go file-exists contract", async () => {
    openAPI.checkIfFileExists.mockResolvedValue({
      data: true,
      status: 200,
      hasResponse: true,
    });
    openAPI.listAppDeployments.mockResolvedValue({
      data: [],
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderModal();
    await flushEffects();

    expect(checkIfFileExists).toHaveBeenCalledWith({
      body: {
        filepath: "listener/app.py",
      },
    });
    const entrypointInput = host.querySelector(
      'input[placeholder="listener/app.py"]',
    ) as HTMLInputElement | null;
    expect(entrypointInput?.value).toBe("listener/app.py");
    expect(window.localStorage.getItem(listenerEntrypointStorageKey)).toBe(
      "listener/app.py",
    );
    expect(host.textContent).toContain("Project One");

    await act(async () => {
      root.unmount();
    });
  });
});
