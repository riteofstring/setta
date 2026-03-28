/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
  vi.clearAllMocks();
});

describe("index", () => {
  it("owns only the final subscription and root-mount seams below appRuntimeBootstrap", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const renderRoot = vi.fn();
    const subscribe = vi.fn();
    const buildRuntimeBootstrapAppProps = vi.fn(() => ({
      router: routerValue,
    }));
    const App = vi.fn(({ router }: { router: unknown }) => (
      <div data-testid="mock-app" data-has-router={String(Boolean(router))} />
    ));

    vi.doMock("react-dom/client", () => ({
      createRoot: vi.fn(() => ({
        render: renderRoot,
      })),
    }));
    vi.doMock("state/subscriptions", () => ({
      subscribe,
    }));
    vi.doMock("./App", () => ({
      App,
    }));
    vi.doMock("./appRuntimeBootstrap", () => ({
      buildRuntimeBootstrapAppProps,
    }));

    await import("./index");

    const { createRoot } = await import("react-dom/client");

    expect(subscribe).toHaveBeenCalledOnce();
    expect(buildRuntimeBootstrapAppProps).toHaveBeenCalledOnce();
    expect(buildRuntimeBootstrapAppProps).toHaveBeenCalledWith();

    expect(createRoot).toHaveBeenCalledOnce();
    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderRoot).toHaveBeenCalledOnce();

    const rendered = renderToStaticMarkup(<>{renderRoot.mock.calls[0][0]}</>);
    expect(rendered).toContain('data-testid="mock-app"');
    expect(App).toHaveBeenCalledOnce();
    expect(vi.mocked(App).mock.calls[0][0]).toMatchObject({
      router: routerValue,
    });
  });
});
