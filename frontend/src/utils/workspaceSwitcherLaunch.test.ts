import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LaunchRequestInput } from "./generatedTypes";
import {
  consumeOpenWorkspaceSwitcherRequest,
  encodePendingWorkspaceLaunchForUrlHash,
  readPendingWorkspaceLaunch,
  writePendingWorkspaceLaunch,
} from "./workspaceSwitcherLaunch";

describe("workspaceSwitcherLaunch", () => {
  let memoryStorage: Storage;
  let windowStub: {
    location: { href: string; hash: string };
    history: {
      state: unknown;
      replaceState: (
        state: unknown,
        title: string,
        url: string | URL | null | undefined,
      ) => void;
    };
    sessionStorage: Storage;
  };

  beforeAll(() => {
    const storage = new Map<string, string>();
    memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    };

    windowStub = {
      location: { href: "http://localhost/", hash: "" },
      history: {
        state: null as unknown,
        replaceState: function (
          state: unknown,
          _title: string,
          url: string | URL | null | undefined,
        ) {
          this.state = state;
          let nextHref: string | null = null;
          if (typeof url === "string") {
            nextHref = new URL(url, windowStub.location.href).toString();
          } else if (url instanceof URL) {
            nextHref = url.toString();
          }
          if (nextHref) {
            windowStub.location.href = nextHref;
            windowStub.location.hash = new URL(nextHref).hash;
          }
        },
      },
      sessionStorage: memoryStorage,
    };

    (globalThis as { window?: typeof windowStub }).window = windowStub;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage;
  });

  beforeEach(() => {
    memoryStorage.clear();
    windowStub.location.href = "http://localhost/";
    windowStub.location.hash = "";
    windowStub.history.state = null;
  });

  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it("reads pending launch from sessionStorage", () => {
    const request: LaunchRequestInput = { workspaceRoot: "/tmp/work" };
    writePendingWorkspaceLaunch({
      request,
      returnUrl: "http://localhost/project",
      requestedAt: 123,
    });

    const pending = readPendingWorkspaceLaunch();
    expect(pending?.request.workspaceRoot).toBe("/tmp/work");
    expect(pending?.returnUrl).toBe("http://localhost/project");
    expect(pending?.requestedAt).toBe(123);
  });

  it("can consume pending launch from the URL hash", () => {
    const request: LaunchRequestInput = { workspaceRoot: "/tmp/work" };
    const encoded = encodePendingWorkspaceLaunchForUrlHash({
      request,
      returnUrl: "http://localhost/project",
      requestedAt: 456,
    });
    if (!encoded) {
      throw new Error("Failed to encode pending launch.");
    }
    windowStub.location.hash = `#pl=${encoded}`;

    const pending = readPendingWorkspaceLaunch();
    expect(pending?.requestedAt).toBe(456);
    expect(windowStub.location.hash).not.toContain("pl=");
    expect(windowStub.location.href).not.toContain("pl=");
  });

  it("prefers the URL hash payload over sessionStorage when both exist", () => {
    writePendingWorkspaceLaunch({
      request: { workspaceRoot: "/tmp/stale" },
      returnUrl: "http://localhost/project",
      requestedAt: 123,
    });

    const encoded = encodePendingWorkspaceLaunchForUrlHash({
      request: { workspaceRoot: "/tmp/fresh" },
      returnUrl: "http://localhost/project",
      requestedAt: 456,
    });
    if (!encoded) {
      throw new Error("Failed to encode pending launch.");
    }
    windowStub.location.hash = `#pl=${encoded}`;

    const pending = readPendingWorkspaceLaunch();
    expect(pending?.request.workspaceRoot).toBe("/tmp/fresh");
    expect(pending?.requestedAt).toBe(456);

    const stored = memoryStorage.getItem("setta.pendingWorkspaceLaunch");
    expect(stored).toContain("/tmp/fresh");
    expect(stored).not.toContain("/tmp/stale");
  });

  it("cleans the URL hash even when history state is not cloneable", () => {
    const encoded = encodePendingWorkspaceLaunchForUrlHash({
      request: { workspaceRoot: "/tmp/work" },
      returnUrl: "http://localhost/project",
      requestedAt: 456,
    });
    if (!encoded) {
      throw new Error("Failed to encode pending launch.");
    }
    windowStub.location.hash = `#pl=${encoded}`;

    windowStub.history.state = { from: "test" };
    const originalReplaceState = windowStub.history.replaceState;
    const seenStates: unknown[] = [];
    windowStub.history.replaceState = function (
      state: unknown,
      title: string,
      url: string | URL | null | undefined,
    ) {
      seenStates.push(state);
      if (state !== null) {
        throw new Error("DataCloneError");
      }
      return originalReplaceState.call(this, state, title, url);
    };

    try {
      const pending = readPendingWorkspaceLaunch();
      expect(pending?.requestedAt).toBe(456);
    } finally {
      windowStub.history.replaceState = originalReplaceState;
    }

    expect(seenStates[0]).toMatchObject({ from: "test" });
    expect(seenStates[1]).toBeNull();
    expect(windowStub.location.href).not.toContain("pl=");
  });

  it("consumes the open-switcher request from the URL", () => {
    windowStub.location.href =
      "http://localhost/?__setta_open_workspace_switcher=1#hash";

    expect(consumeOpenWorkspaceSwitcherRequest()).toBe(true);
    expect(windowStub.location.href).not.toContain(
      "__setta_open_workspace_switcher",
    );
  });
});
