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

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
    }),
  );
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

  it("shows the manual app spec shape contract near the editor", async () => {
    const { host, root } = await renderPane();

    expect(host.textContent).toContain("Root elements must include");
    expect(host.textContent).toContain("ActionButton");

    await act(async () => {
      root.unmount();
    });
  });

  it("does not publish draft preview overrides while preview is hidden", async () => {
    const { host, root } = await renderPane();
    const textarea = host.querySelector(
      'textarea[aria-label="App Spec JSON"]',
    ) as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();

    await act(async () => {
      setTextAreaValue(
        textarea as HTMLTextAreaElement,
        '{"key":"app-root","type":"Card"}',
      );
    });

    expect(useAppPreview.getState().previewSpecOverride).toBeUndefined();
    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Save",
    );
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it("syncs the current draft when preview is shown", async () => {
    const { host, root } = await renderPane();
    const textarea = host.querySelector(
      'textarea[aria-label="App Spec JSON"]',
    ) as HTMLTextAreaElement | null;
    const showPreviewButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Show Preview",
    );
    expect(textarea).toBeTruthy();
    expect(showPreviewButton).toBeTruthy();

    await act(async () => {
      setTextAreaValue(
        textarea as HTMLTextAreaElement,
        '{"key":"app-root","type":"Card"}',
      );
    });
    await act(async () => {
      showPreviewButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(useAppPreview.getState().previewSpecOverride).toEqual({
      key: "app-root",
      type: "Card",
    });

    await act(async () => {
      root.unmount();
    });
  });
});
