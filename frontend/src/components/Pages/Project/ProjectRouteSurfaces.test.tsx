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

describe("ProjectRouteSurfaces", () => {
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

  it("renders a loading spinner while the project route surface chunk is unresolved", async () => {
    const deferredModule = createDeferredModule<{
      MainContainer: () => JSX.Element;
    }>();
    vi.doMock("./MainContainer", () => deferredModule.promise);

    const { ProjectRouteSurface } = await import("./ProjectRouteSurfaces");

    await act(async () => {
      root.render(<ProjectRouteSurface />);
    });

    expect(host.querySelector(".gg-spinner")).not.toBeNull();

    deferredModule.resolve({
      MainContainer: () => <div data-testid="project-route-surface" />,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      host.querySelector('[data-testid="project-route-surface"]'),
    ).not.toBe(null);
    expect(host.querySelector(".gg-spinner")).toBeNull();
  });
});
