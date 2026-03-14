import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveLauncherBootstrapUrl } from "./launcherBootstrapUrl";

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

describe("resolveLauncherBootstrapUrl", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocation = (globalThis as { location?: unknown }).location;
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown })
    .sessionStorage;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const env = import.meta.env as unknown as Record<string, unknown>;
  const previousDev = env["DEV"];
  const previousBackendOrigin = env["VITE_BACKEND_ORIGIN"];
  const sessionStorageStub = createMemoryStorage();
  const localStorageStub = createMemoryStorage();
  const windowStub = {
    location: {
      href: "http://127.0.0.1:3000/launching",
      origin: "http://127.0.0.1:3000",
    },
    sessionStorage: sessionStorageStub,
    localStorage: localStorageStub,
  };

  beforeAll(() => {
    (globalThis as { window?: unknown }).window = windowStub;
    (globalThis as { location?: unknown }).location = windowStub.location;
    (globalThis as { sessionStorage?: Storage }).sessionStorage =
      sessionStorageStub;
    (globalThis as { localStorage?: Storage }).localStorage = localStorageStub;
  });

  beforeEach(() => {
    sessionStorageStub.clear();
    localStorageStub.clear();
    windowStub.location.href = "http://127.0.0.1:3000/launching";
    windowStub.location.origin = "http://127.0.0.1:3000";
    env["DEV"] = previousDev;
    env["VITE_BACKEND_ORIGIN"] = previousBackendOrigin;
  });

  afterAll(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalLocation === undefined) {
      delete (globalThis as { location?: unknown }).location;
    } else {
      (globalThis as { location?: unknown }).location = originalLocation;
    }
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      (globalThis as { sessionStorage?: unknown }).sessionStorage =
        originalSessionStorage;
    }
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as { localStorage?: unknown }).localStorage =
        originalLocalStorage;
    }

    env["DEV"] = previousDev;
    env["VITE_BACKEND_ORIGIN"] = previousBackendOrigin;
  });

  it("returns the bootstrap fragment unchanged in dev mode", () => {
    env["DEV"] = true;
    const input = "http://127.0.0.1:61111/__setta__/bootstrap#token=tok";

    expect(resolveLauncherBootstrapUrl(input)).toBe(input);
  });

  it("adds the trusted launcher origin handoff in built mode", () => {
    env["DEV"] = false;
    windowStub.location.href = "http://remote.example:7777/launching";
    windowStub.location.origin = "http://remote.example:7777";
    sessionStorageStub.setItem(
      "setta.launcherOrigin",
      "http://remote.example:9999",
    );

    const resolved = resolveLauncherBootstrapUrl(
      "http://remote.example:7777/__setta__/bootstrap#token=tok",
    );

    expect(resolved).toBe(
      "http://remote.example:7777/__setta__/bootstrap#token=tok&lo=http%3A%2F%2Fremote.example%3A9999",
    );
  });
});
