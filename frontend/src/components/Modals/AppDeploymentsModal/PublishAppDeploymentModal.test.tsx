/* @vitest-environment jsdom */

import * as Dialog from "@radix-ui/react-dialog";
import { checkIfFileExists } from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppDefinition, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createAppDefinition, createProjectConfig } from "utils/generatedTypes";

const openAPI = vi.hoisted(() => ({
  checkIfFileExists: vi.fn(),
  listAppDeployments: vi.fn(),
  publishAppDeployment: vi.fn(),
}));

vi.mock("state/actions/modal", () => ({
  closeModal: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    checkIfFileExists: openAPI.checkIfFileExists,
    listAppDeployments: openAPI.listAppDeployments,
    publishAppDeployment: openAPI.publishAppDeployment,
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

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

  await act(async () => {
    root.render(
      <Dialog.Root open>
        <Dialog.Content>
          <PublishAppDeploymentModal open />
        </Dialog.Content>
      </Dialog.Root>,
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
    resetProjectStores();
    installTestLocalStorage();
    document.body.innerHTML = "";
    openAPI.checkIfFileExists.mockReset();
    openAPI.listAppDeployments.mockReset();
    openAPI.publishAppDeployment.mockReset();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        name: "Project One",
      }),
    });
    useAppDefinition.setState({
      appSpec: null,
      appDefinition: createAppDefinition(),
    });
    setReactActEnvironment(true);
  });

  afterEach(() => {
    resetProjectStores();
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

    await act(async () => {
      root.unmount();
    });
  });
});
