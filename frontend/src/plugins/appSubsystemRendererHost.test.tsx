/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppSubsystemFrontendHost } from "./appSubsystem";
import { AppSubsystemRendererHost } from "./appSubsystemRendererHost";

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

describe("AppSubsystemRendererHost", () => {
  let hostElement: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.body.innerHTML = "";
    hostElement = document.createElement("div");
    document.body.appendChild(hostElement);
    root = createRoot(hostElement);
    setReactActEnvironment(true);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = "";
    setReactActEnvironment(originalReactActEnvironment);
  });

  it("mounts, updates, and unmounts renderer surfaces", async () => {
    const mount = vi.fn();
    const update = vi.fn();
    const unmount = vi.fn();
    const renderer = { mount, update, unmount };
    const frontendHost = createAppSubsystemFrontendHost();

    await act(async () => {
      root.render(
        <AppSubsystemRendererHost
          renderer={renderer}
          props={{ label: "first" }}
          host={frontendHost}
        />,
      );
    });

    const mountTarget = mount.mock.calls[0]?.[0];
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0]?.[1]).toEqual({ label: "first" });
    expect(mount.mock.calls[0]?.[2]).toBe(frontendHost);
    expect(mountTarget).toBeInstanceOf(HTMLElement);

    await act(async () => {
      root.render(
        <AppSubsystemRendererHost
          renderer={renderer}
          props={{ label: "second" }}
          host={frontendHost}
        />,
      );
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      mountTarget,
      { label: "second" },
      frontendHost,
    );

    await act(async () => {
      root.render(<></>);
    });

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledWith(mountTarget);
  });

  it("remounts renderers without update handlers when props change", async () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    const renderer = { mount, unmount };
    const frontendHost = createAppSubsystemFrontendHost();

    await act(async () => {
      root.render(
        <AppSubsystemRendererHost
          renderer={renderer}
          props={{ label: "first" }}
          host={frontendHost}
        />,
      );
    });

    const mountTarget = mount.mock.calls[0]?.[0];

    await act(async () => {
      root.render(
        <AppSubsystemRendererHost
          renderer={renderer}
          props={{ label: "second" }}
          host={frontendHost}
        />,
      );
    });

    expect(mount).toHaveBeenCalledTimes(2);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledWith(mountTarget);
    expect(mount.mock.calls[1]).toEqual([
      mountTarget,
      { label: "second" },
      frontendHost,
    ]);
  });
});
