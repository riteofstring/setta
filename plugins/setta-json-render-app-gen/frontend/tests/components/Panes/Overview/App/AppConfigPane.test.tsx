/* @vitest-environment jsdom */

import { createAppSubsystemFrontendHost } from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../../../../testUtils/reactRefreshPreamble";
import { useAppDefinition } from "../../../../../src/appSubsystemDefinitionState";
import { AppSubsystemFrontendHostProvider } from "../../../../../src/appSubsystemFrontendHostContext";
import { useAppPreview } from "../../../../../src/appSubsystemProjectState";
import { AppConfigPane } from "../../../../../src/components/Panes/Overview/App/AppConfigPane";

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

type RenderedPane = {
  host: HTMLDivElement;
  root: Root;
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

async function renderPane(): Promise<RenderedPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const appSubsystemHost = createAppSubsystemFrontendHost({
    notify: vi.fn(),
    getProjectContext: () => ({
      defaultProjectConfigId: null,
      projectMetadata: [],
      projectConfig: {
        id: null,
        name: "",
        entryCodeBlockId: null,
      },
    }),
    subscribeProjectContext: () => () => undefined,
  });

  await act(async () => {
    root.render(
      <AppSubsystemFrontendHostProvider host={appSubsystemHost}>
        <AppConfigPane />
      </AppSubsystemFrontendHostProvider>,
    );
  });

  return { host, root };
}

describe("AppConfigPane", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    useAppDefinition.getState().reset?.();
    useAppPreview.getState().reset?.();
    setReactActEnvironment(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    useAppDefinition.getState().reset?.();
    useAppPreview.getState().reset?.();
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("toggles the advanced accordion through the plugin-owned pane accordion", async () => {
    const { host, root } = await renderPane();

    const getTrigger = () =>
      host.querySelector(
        '[data-testid="app-config-advanced-accordion"]',
      ) as HTMLButtonElement | null;

    expect(getTrigger()?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      getTrigger()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getTrigger()?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      getTrigger()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getTrigger()?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      root.unmount();
    });
  });
});
