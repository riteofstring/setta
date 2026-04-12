/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DeferredModule<TModule> = {
  promise: Promise<TModule>;
  resolve: (value: TModule) => void;
};

function createDeferredModule<TModule>(): DeferredModule<TModule> {
  let resolve!: (value: TModule) => void;
  const promise = new Promise<TModule>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("RouteEntrySurfaces", () => {
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

  it("renders a loading spinner while the home route surface chunk is unresolved", async () => {
    const deferredModule = createDeferredModule<{
      HomePage: () => JSX.Element;
    }>();
    vi.doMock("./Home/HomePage", () => deferredModule.promise);

    const { HomeRouteSurface } = await import("./RouteEntrySurfaces");

    await act(async () => {
      root.render(<HomeRouteSurface />);
    });

    expect(host.querySelector(".gg-spinner")).not.toBeNull();

    deferredModule.resolve({
      HomePage: () => <div data-testid="home-route-surface" />,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('[data-testid="home-route-surface"]')).not.toBe(
      null,
    );
    expect(host.querySelector(".gg-spinner")).toBeNull();
  });
});
