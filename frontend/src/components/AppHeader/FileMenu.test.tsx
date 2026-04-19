import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileMenu } from "./FileMenu";

const { useAppSubsystemAppDeploymentModalMock } = vi.hoisted(() => {
  type AppDeploymentModalRegistration = {
    component: () => null;
  } | null;
  return {
    useAppSubsystemAppDeploymentModalMock: vi.fn<
      () => AppDeploymentModalRegistration
    >(() => null),
  };
});

vi.mock("components/Utils/atoms/menubar/menudropdown", () => ({
  NavbarMenuDropdown: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("components/Utils/atoms/menubar/menudropdownitem", () => ({
  MenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("plugins/appSubsystem", async () => {
  const actual = await vi.importActual<typeof import("plugins/appSubsystem")>(
    "plugins/appSubsystem",
  );
  return {
    ...actual,
    useAppSubsystemAppDeploymentModal: useAppSubsystemAppDeploymentModalMock,
  };
});

vi.mock("state/actions/project/loadProject", () => ({
  useCreateAndGoToProjectConfig: () => vi.fn(),
}));

vi.mock("state/actions/project/saveProject", () => ({
  saveProject: vi.fn(),
}));

describe("FileMenu", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useAppSubsystemAppDeploymentModalMock.mockReset();
    useAppSubsystemAppDeploymentModalMock.mockReturnValue(null);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("hides the app deployment entry when the app subsystem modal is unavailable", () => {
    const markup = renderToStaticMarkup(<FileMenu />);

    expect(markup).not.toContain("Publish App Deployment");
  });

  it("shows the app deployment entry when the app subsystem modal is registered", () => {
    useAppSubsystemAppDeploymentModalMock.mockReturnValue({
      component: () => null,
    });

    const markup = renderToStaticMarkup(<FileMenu />);

    expect(markup).toContain("Publish App Deployment");
  });
});
