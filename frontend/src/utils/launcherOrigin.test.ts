import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getOrInitLauncherOrigin } from "./launcherOrigin";

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

describe("launcherOrigin", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocation = (globalThis as { location?: unknown }).location;
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown })
    .sessionStorage;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const sessionStorageStub = createMemoryStorage();
  const localStorageStub = createMemoryStorage();
  const windowStub = {
    location: {
      href: "http://127.0.0.1:3000/",
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
    windowStub.location.href = "http://127.0.0.1:3000/";
    windowStub.location.origin = "http://127.0.0.1:3000";
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
  });

  it("reads launcher origin from session storage in built mode", () => {
    sessionStorageStub.setItem("setta.launcherOrigin", "http://127.0.0.1:9000");

    expect(getOrInitLauncherOrigin(windowStub.location.origin)).toBe(
      "http://127.0.0.1:9000",
    );
  });

  it("clears mismatched launcher origin hostnames", () => {
    sessionStorageStub.setItem(
      "setta.launcherOrigin",
      "http://attacker.example:9000",
    );

    const resolved = getOrInitLauncherOrigin(windowStub.location.origin);

    expect(resolved).toBe("http://127.0.0.1:3000");
    expect(sessionStorageStub.getItem("setta.launcherOrigin")).toBe(
      "http://127.0.0.1:3000",
    );
  });
});
