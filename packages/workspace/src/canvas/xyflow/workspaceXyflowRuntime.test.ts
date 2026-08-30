import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../../workspaceHost";
import {
  getWorkspaceXyflowRuntime,
  registerWorkspaceXyflowInstance,
} from "./workspaceXyflowRuntime";
import type { WorkspaceXyflowInstance } from "./types";

const hosts: Array<WorkspaceHost> = [];

function createHost(): WorkspaceHost {
  const host = createWorkspaceHost();
  hosts.push(host);
  return host;
}

function createInstance(viewport: { x: number; y: number; zoom: number }) {
  const getViewport = vi.fn(() => viewport);
  const setViewport = vi.fn(() => Promise.resolve(true));
  const screenToFlowPosition = vi.fn((position: { x: number; y: number }) => ({
    x: position.x - 10,
    y: position.y - 20,
  }));
  return {
    getViewport,
    setViewport,
    screenToFlowPosition,
    instance: {
      getViewport,
      setViewport,
      screenToFlowPosition,
    } as unknown as WorkspaceXyflowInstance,
  };
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.dispose();
  }
});

describe("Workspace XYFlow runtime", () => {
  it("keeps public XYFlow instances isolated by WorkspaceHost", async () => {
    const firstHost = createHost();
    const secondHost = createHost();
    const firstRuntime = getWorkspaceXyflowRuntime(firstHost);
    const secondRuntime = getWorkspaceXyflowRuntime(secondHost);
    const first = createInstance({ x: 10, y: 20, zoom: 1.5 });
    const second = createInstance({ x: 30, y: 40, zoom: 2 });

    const unregisterFirst = registerWorkspaceXyflowInstance(
      firstHost,
      first.instance,
    );
    const unregisterSecond = registerWorkspaceXyflowInstance(
      secondHost,
      second.instance,
    );

    expect(firstRuntime.getInstance()).toBe(first.instance);
    expect(secondRuntime.getInstance()).toBe(second.instance);
    expect(firstRuntime.getViewport()).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(secondRuntime.screenToFlowPosition({ x: 17, y: 29 })).toEqual({
      x: 7,
      y: 9,
    });
    await expect(
      firstRuntime.setViewport({ x: 4, y: 5, zoom: 1 }),
    ).resolves.toBe(true);
    expect(first.setViewport).toHaveBeenCalledWith({ x: 4, y: 5, zoom: 1 });
    expect(second.setViewport).not.toHaveBeenCalled();

    unregisterFirst();
    unregisterSecond();
    expect(firstRuntime.getInstance()).toBeNull();
    expect(secondRuntime.getInstance()).toBeNull();
  });

  it("does not let an obsolete unmount detach a replacement instance", () => {
    const host = createHost();
    const runtime = getWorkspaceXyflowRuntime(host);
    const first = createInstance({ x: 0, y: 0, zoom: 1 });
    const replacement = createInstance({ x: 1, y: 2, zoom: 3 });

    const unregisterFirst = registerWorkspaceXyflowInstance(
      host,
      first.instance,
    );
    const unregisterReplacement = registerWorkspaceXyflowInstance(
      host,
      replacement.instance,
    );

    unregisterFirst();
    expect(runtime.getInstance()).toBe(replacement.instance);
    unregisterReplacement();
    expect(runtime.getInstance()).toBeNull();
  });

  it("releases a mounted instance when its host disposes", () => {
    const host = createHost();
    const runtime = getWorkspaceXyflowRuntime(host);
    const instance = createInstance({ x: 0, y: 0, zoom: 1 });
    registerWorkspaceXyflowInstance(host, instance.instance);

    host.dispose();

    expect(runtime.getInstance()).toBeNull();
  });
});
