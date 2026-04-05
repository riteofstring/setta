/* @vitest-environment jsdom */

import * as Dialog from "@radix-ui/react-dialog";
import { checkIfFileExists } from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";

const openAPI = vi.hoisted(() => ({
  checkIfFileExists: vi.fn(),
}));

const generatedEndpoints = vi.hoisted(() => ({
  route_list_share_deployments: vi.fn(),
  route_publish_share_deployment: vi.fn(),
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
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_list_share_deployments:
      generatedEndpoints.route_list_share_deployments,
    route_publish_share_deployment:
      generatedEndpoints.route_publish_share_deployment,
  };
});

import { PublishShareDeploymentModal } from "./PublishShareDeploymentModal";

type RenderedModal = {
  host: HTMLDivElement;
  root: Root;
};

const listenerEntrypointStorageKey =
  "setta.publishShareDeployment.listenerEntrypoint";
const originalLocalStorage = window.localStorage;
const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

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
          <PublishShareDeploymentModal open />
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

describe("PublishShareDeploymentModal", () => {
  beforeEach(() => {
    resetProjectStores();
    installTestLocalStorage();
    document.body.innerHTML = "";
    openAPI.checkIfFileExists.mockReset();
    generatedEndpoints.route_list_share_deployments.mockReset();
    generatedEndpoints.route_publish_share_deployment.mockReset();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        name: "Project One",
      }),
    });
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    resetProjectStores();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    document.body.innerHTML = "";
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = originalReactActEnvironment;
  });

  it("autofills the listener entrypoint through the Go file-exists contract", async () => {
    openAPI.checkIfFileExists.mockResolvedValue({
      data: true,
      status: 200,
      hasResponse: true,
    });
    generatedEndpoints.route_list_share_deployments.mockResolvedValue({
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
