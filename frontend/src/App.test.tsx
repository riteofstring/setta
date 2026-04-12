/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DeferredModule = {
  promise: Promise<{
    AppRouterProvider: () => JSX.Element;
  }>;
  resolve: (value: { AppRouterProvider: () => JSX.Element }) => void;
};

function createDeferredModule(): DeferredModule {
  let resolve!: (value: { AppRouterProvider: () => JSX.Element }) => void;
  const promise = new Promise<{ AppRouterProvider: () => JSX.Element }>(
    (innerResolve) => {
      resolve = innerResolve;
    },
  );
  return { promise, resolve };
}

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetModules();
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
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("renders a visible fallback while the router chunk is still loading", async () => {
    const deferredModule = createDeferredModule();
    vi.doMock("./AppRouterProvider", () => deferredModule.promise);

    const { App } = await import("./App");

    await act(async () => {
      root.render(<App />);
    });

    const loadingState = host.querySelector(
      '[data-testid="app-router-loading-state"]',
    );
    expect(loadingState).not.toBeNull();
    expect(loadingState?.textContent).toContain("Loading Setta...");
    expect(loadingState?.textContent).toContain("Preparing the app surface.");

    deferredModule.resolve({
      AppRouterProvider: () => <div data-testid="app-router-provider" />,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('[data-testid="app-router-provider"]')).not.toBe(
      null,
    );
    expect(
      host.querySelector('[data-testid="app-router-loading-state"]'),
    ).toBeNull();
  });
});
