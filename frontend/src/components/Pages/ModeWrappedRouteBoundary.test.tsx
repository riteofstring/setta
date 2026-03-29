/* @vitest-environment jsdom */

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerMode } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModeWrappedRouteBoundary } from "./ModeWrappedRouteBoundary";

const hoisted = vi.hoisted(() => ({
  initializeServerModeMock: vi.fn(),
}));

vi.mock("components/Pages/AppShell", () => ({
  AppShell: ({
    children,
    isLoading,
    loadingContent,
  }: {
    children: ReactNode;
    isLoading: boolean;
    loadingContent: ReactNode;
  }) => (
    <div data-testid="mock-app-shell" data-is-loading={String(isLoading)}>
      <div data-testid="mock-loading-content">{loadingContent}</div>
      <div data-testid="mock-shell-children">{children}</div>
    </div>
  ),
}));

vi.mock("state/actions/serverMode", () => ({
  initializeServerMode: (...args: Array<unknown>) =>
    hoisted.initializeServerModeMock(...args),
}));

describe("ModeWrappedRouteBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    hoisted.initializeServerModeMock.mockReset();
    hoisted.initializeServerModeMock.mockResolvedValue(null);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    vi.restoreAllMocks();
  });

  it("shows the loading shell and initializes server mode while unresolved", async () => {
    await act(async () => {
      root.render(
        <ModeWrappedRouteBoundary
          ide={<div data-testid="ide-route" />}
          share={<div data-testid="share-route" />}
          app={<div data-testid="app-route" />}
          launcher={<div data-testid="launcher-route" />}
        />,
      );
    });

    expect(hoisted.initializeServerModeMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="mock-app-shell"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-testid="mock-app-shell"]')
        ?.getAttribute("data-is-loading"),
    ).toBe("true");
    expect(host.textContent).toContain("Checking server mode...");
  });

  it("shows the error shell and resets the server-mode store when retrying", async () => {
    useServerMode.setState({
      mode: null,
      modeResolved: true,
      modeError: "Failed to check server mode (status 500).",
    });

    await act(async () => {
      root.render(
        <ModeWrappedRouteBoundary
          ide={<div data-testid="ide-route" />}
          share={<div data-testid="share-route" />}
          app={<div data-testid="app-route" />}
          launcher={<div data-testid="launcher-route" />}
        />,
      );
    });

    expect(host.textContent).toContain("Unable to load app");
    expect(host.textContent).toContain(
      "Failed to check server mode (status 500).",
    );

    const retryButton = host.querySelector("button");
    if (!retryButton) {
      throw new Error("Expected retry button");
    }

    await act(async () => {
      retryButton.click();
    });

    expect(useServerMode.getState()).toEqual({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  it("resolves explicit non-ide route elements once mode is known", async () => {
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });

    await act(async () => {
      root.render(
        <ModeWrappedRouteBoundary
          ide={<div data-testid="ide-route" />}
          share={<div data-testid="share-route" />}
          app={<div data-testid="app-route">app route</div>}
          launcher={<div data-testid="launcher-route" />}
        />,
      );
    });

    expect(hoisted.initializeServerModeMock).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="app-route"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="ide-route"]')).toBeNull();
  });
});
