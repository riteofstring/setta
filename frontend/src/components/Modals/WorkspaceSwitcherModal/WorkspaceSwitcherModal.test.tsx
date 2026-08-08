/* @vitest-environment jsdom */

import * as Dialog from "@radix-ui/react-dialog";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { closeModal } from "state/actions/modal";
import { useServerMode } from "state/definitions";
import "testUtils/reactRefreshPreamble";
import {
  readPendingWorkspaceLaunch,
  readWorkspaceSwitcherDraft,
} from "utils/workspaceSwitcherLaunch";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { WorkspaceSwitcherModal } from "./WorkspaceSwitcherModal";

vi.mock("state/actions/modal", () => ({
  closeModal: vi.fn(),
}));

const { routeCreateWorkspaceLaunchIntentMock, routeGetSettaHomeInfoMock } =
  vi.hoisted(() => ({
    routeCreateWorkspaceLaunchIntentMock: vi.fn(),
    routeGetSettaHomeInfoMock: vi.fn(),
  }));

vi.mock("openapi/http", () => ({
  createWorkspaceLaunchIntent: routeCreateWorkspaceLaunchIntentMock,
  getSettaHomeInfo: routeGetSettaHomeInfoMock,
}));

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    clear(): void {
      values.clear();
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    get length(): number {
      return values.size;
    },
  };
}

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

type RenderedModal = {
  host: HTMLDivElement;
  root: Root;
};

const originalLocalStorage = window.localStorage;
const originalSessionStorage = window.sessionStorage;
const localStorageStub = createMemoryStorage();
const sessionStorageStub = createMemoryStorage();

function setServerMode(mode: "ide" | "launcher") {
  useServerMode.setState({
    mode,
    modeResolved: true,
    modeError: null,
  });
  syncStoreInitialState(useServerMode);
}

async function renderModal(): Promise<RenderedModal> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter>
        <Dialog.Root open>
          <Dialog.Content>
            <WorkspaceSwitcherModal />
          </Dialog.Content>
        </Dialog.Root>
      </MemoryRouter>,
    );
  });

  return { host, root };
}

async function unmountModal(rendered: RenderedModal): Promise<void> {
  await act(async () => {
    rendered.root.unmount();
  });
}

function setNativeInputValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
}

function getInputByPlaceholder(
  host: HTMLElement,
  placeholder: string,
): HTMLInputElement {
  const input =
    Array.from(host.querySelectorAll("input")).find(
      (candidate) => candidate.getAttribute("placeholder") === placeholder,
    ) ?? null;
  if (!input) {
    throw new Error(`Missing input with placeholder: ${placeholder}`);
  }
  return input as HTMLInputElement;
}

function getButtonByText(host: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
  if (!button) {
    throw new Error(`Missing button with label: ${label}`);
  }
  return button;
}

async function setInputValue(
  host: HTMLElement,
  placeholder: string,
  value: string,
): Promise<void> {
  const input = getInputByPlaceholder(host, placeholder);
  await act(async () => {
    setNativeInputValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function setSettaFilesLocation(
  host: HTMLElement,
  value: string,
): Promise<void> {
  const select = host.querySelector(
    'select[aria-label="Setta Files Location"]',
  ) as HTMLSelectElement | null;
  if (!select) {
    throw new Error("Missing Setta Files Location select");
  }
  await act(async () => {
    setNativeInputValue(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickButton(host: HTMLElement, label: string): Promise<void> {
  const button = getButtonByText(host, label);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("WorkspaceSwitcherModal", () => {
  beforeEach(() => {
    routeCreateWorkspaceLaunchIntentMock.mockReset();
    routeGetSettaHomeInfoMock.mockReset();
    routeGetSettaHomeInfoMock.mockResolvedValue({
      data: {
        activeSettaFilesLocation: null,
        globalSettaFilesBase: "/tmp/setta-home",
        llmConfigPath: "/tmp/setta-home/llm.yaml",
        settaHome: "/tmp/setta-home",
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageStub,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: sessionStorageStub,
    });
    localStorageStub.clear();
    sessionStorageStub.clear();
    document.body.innerHTML = "";
    vi.mocked(closeModal).mockClear();
    setServerMode("ide");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorageStub.clear();
    sessionStorageStub.clear();
  });

  afterAll(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
  });

  it("renders desktop launcher management controls", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Dialog.Root open>
          <Dialog.Content>
            <WorkspaceSwitcherModal />
          </Dialog.Content>
        </Dialog.Root>
      </MemoryRouter>,
    );

    expect(markup).toContain("Desktop Launcher");
    expect(markup).toContain("Setup Desktop App");
    expect(markup).toContain("Repair Desktop App");
    expect(markup).toContain("Remove Desktop App");
  });

  it("hides desktop launcher management controls in launcher mode", () => {
    setServerMode("launcher");

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Dialog.Root open>
          <Dialog.Content>
            <WorkspaceSwitcherModal />
          </Dialog.Content>
        </Dialog.Root>
      </MemoryRouter>,
    );

    expect(markup).not.toContain("Desktop Launcher");
    expect(markup).not.toContain("Setup Desktop App");
  });

  it("launches with trimmed form data and stores the pending launch", async () => {
    setServerMode("launcher");
    routeCreateWorkspaceLaunchIntentMock.mockResolvedValue({
      data: {
        ok: true,
        launchIntentToken: "intent-token-123",
        requestedAt: 456,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const rendered = await renderModal();

    await setInputValue(
      rendered.host,
      "/path/to/workspace",
      "  /tmp/workspace  ",
    );
    await setInputValue(rendered.host, "user@host", " user@example.com ");
    await setInputValue(
      rendered.host,
      "-i ~/.ssh/id_ed25519 -J user@jump",
      " -i ~/.ssh/id_ed25519 ",
    );
    await setInputValue(
      rendered.host,
      "source .venv/bin/activate && setta",
      " source ~/.profile && setta ",
    );
    await setInputValue(rendered.host, "61000", " 61000 ");
    await setSettaFilesLocation(rendered.host, "global");
    await clickButton(rendered.host, "Launch");

    expect(routeCreateWorkspaceLaunchIntentMock).toHaveBeenCalledWith({
      body: {
        launchRequest: {
          workspaceRoot: "/tmp/workspace",
          sshTarget: "user@example.com",
          settaFilesLocation: "global",
          sshArgs: "-i ~/.ssh/id_ed25519",
          remoteCmd: "source ~/.profile && setta",
          localPort: 61000,
        },
        returnUrl: window.location.href,
      },
    });
    expect(readWorkspaceSwitcherDraft()).toEqual({
      workspaceRoot: "/tmp/workspace",
      sshTarget: "user@example.com",
      settaFilesLocation: "global",
      sshArgs: "-i ~/.ssh/id_ed25519",
      remoteCmd: "source ~/.profile && setta",
      localPort: 61000,
    });
    expect(readPendingWorkspaceLaunch()).toEqual({
      request: {
        launchIntentToken: "intent-token-123",
      },
      returnUrl: window.location.href,
      requestedAt: 456,
      sshTarget: "user@example.com",
      settaFilesLocation: "global",
    });
    expect(closeModal).toHaveBeenCalledTimes(1);

    await unmountModal(rendered);
  });

  it("rejects invalid local tunnel ports before launch", async () => {
    setServerMode("launcher");
    const rendered = await renderModal();

    await setInputValue(rendered.host, "/path/to/workspace", "/tmp/workspace");
    await setInputValue(rendered.host, "user@host", "user@example.com");
    await setInputValue(rendered.host, "61000", "12.5");
    await clickButton(rendered.host, "Launch");

    expect(routeCreateWorkspaceLaunchIntentMock).not.toHaveBeenCalled();
    expect(rendered.host.textContent).toContain(
      "Local port must be a whole number.",
    );

    await unmountModal(rendered);
  });

  it("surfaces launch-intent endpoint errors", async () => {
    setServerMode("launcher");
    routeCreateWorkspaceLaunchIntentMock.mockResolvedValue({
      data: undefined,
      error: {
        detail: "Launch intent store unavailable.",
      },
      response: new Response(null, { status: 503 }),
    });
    const rendered = await renderModal();

    await setInputValue(rendered.host, "/path/to/workspace", "/tmp/workspace");
    await clickButton(rendered.host, "Launch");

    expect(rendered.host.textContent).toContain(
      "Launch intent store unavailable.",
    );
    expect(closeModal).not.toHaveBeenCalled();

    await unmountModal(rendered);
  });
});
