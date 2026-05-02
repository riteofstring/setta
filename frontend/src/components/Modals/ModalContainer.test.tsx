/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAllProjectMetadata, useModal } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { ModalContainer } from "./ModalContainer";
import { ModalTypeEnum } from "./types";

const { loadAllProjectMetadataMock, useAppSubsystemAppDeploymentModalMock } =
  vi.hoisted(() => ({
    loadAllProjectMetadataMock: vi.fn(),
    useAppSubsystemAppDeploymentModalMock: vi.fn(() => null),
  }));

vi.mock("state/actions/project/loadProject", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/project/loadProject")
  >("state/actions/project/loadProject");
  return {
    ...actual,
    loadAllProjectMetadata: loadAllProjectMetadataMock,
  };
});

vi.mock("plugins/appSubsystem", async () => {
  const actual = await vi.importActual<typeof import("plugins/appSubsystem")>(
    "plugins/appSubsystem",
  );
  return {
    ...actual,
    useAppSubsystemAppDeploymentModal: useAppSubsystemAppDeploymentModalMock,
  };
});

function resetModalStores() {
  resetProjectStores();
  useAllProjectMetadata.getState().reset?.();
}

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

async function renderModalContainer(): Promise<Root> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ModalContainer>
          <div>modal host</div>
        </ModalContainer>
      </MemoryRouter>,
    );
  });

  return root;
}

describe("ModalContainer", () => {
  beforeEach(() => {
    resetModalStores();
    document.body.innerHTML = "";
    loadAllProjectMetadataMock.mockReset();
    useAppSubsystemAppDeploymentModalMock.mockReset();
    useAppSubsystemAppDeploymentModalMock.mockReturnValue(null);
    setReactActEnvironment(true);
  });

  afterEach(() => {
    resetModalStores();
    document.body.innerHTML = "";
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("renders the delete-project modal from modal state", async () => {
    useModal.setState({
      open: true,
      modalInfo: {
        type: ModalTypeEnum.DELETE_PROJECT_WARNING,
        data: {
          selectedProjectsIdName: [{ id: "project-1", name: "Project One" }],
        },
      },
    });

    const root = await renderModalContainer();

    expect(document.body.textContent).toContain("Confirm Project Deletion");
    expect(document.body.textContent).toContain("Project One");

    await act(async () => {
      root.unmount();
    });
  });

  it("renders the load-project modal for open-dependent modal types", async () => {
    useModal.setState({
      open: true,
      modalInfo: {
        type: ModalTypeEnum.FILE_MENU_LOAD_PROJECT_CONFIG,
        data: null,
      },
    });

    const root = await renderModalContainer();

    expect(document.body.textContent).toContain("Load Project Config");
    expect(document.body.textContent).toContain(
      "No saved project configs found.",
    );
    expect(loadAllProjectMetadataMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("renders the app deployment modal through the app subsystem runtime hook", async () => {
    useAppSubsystemAppDeploymentModalMock.mockReturnValue({
      renderer: {
        mount: (target: HTMLElement, props: { open: boolean }) => {
          target.textContent = props.open
            ? "Plugin-owned App Deployment Modal"
            : "";
        },
        update: (target: HTMLElement, props: { open: boolean }) => {
          target.textContent = props.open
            ? "Plugin-owned App Deployment Modal"
            : "";
        },
        unmount: (target: HTMLElement) => {
          target.textContent = "";
        },
      },
    });
    useModal.setState({
      open: true,
      modalInfo: {
        type: ModalTypeEnum.PUBLISH_APP_DEPLOYMENT,
        data: null,
      },
    });

    const root = await renderModalContainer();

    expect(document.body.textContent).toContain(
      "Plugin-owned App Deployment Modal",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
