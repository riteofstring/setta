import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY } from "./backendOriginOverride";
import { C_ADDRESSES } from "./c_addresses";
import { GoRoutePrefixHelpers } from "./generatedRoutes";

function createMemoryStorage() {
  const storage = new Map<string, string>();
  const memoryStorage: Storage = {
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
  return { memoryStorage, storage };
}

describe("C_ADDRESSES", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocation = (globalThis as { location?: unknown }).location;
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown })
    .sessionStorage;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  const env = import.meta.env as unknown as Record<string, unknown>;
  const previousDev = env["DEV"];
  const previousBackendOrigin = env["VITE_BACKEND_ORIGIN"];

  const { memoryStorage: sessionStorageStub } = createMemoryStorage();
  const { memoryStorage: localStorageStub } = createMemoryStorage();

  const windowStub = {
    location: {
      href: "http://localhost/",
      origin: "http://localhost",
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

  it("routes /launch to a stable launcher origin in dev mode", () => {
    env["DEV"] = true;
    env["VITE_BACKEND_ORIGIN"] = "http://127.0.0.1:8000";
    sessionStorageStub.setItem(
      BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      "http://127.0.0.1:61000",
    );

    expect(C_ADDRESSES.BACKEND_ORIGIN).toBe("http://127.0.0.1:61000");
    expect(C_ADDRESSES.LAUNCHER_ORIGIN).toBe("http://127.0.0.1:8000");
    expect(C_ADDRESSES.LAUNCHER).toBe(
      `http://127.0.0.1:8000${GoRoutePrefixHelpers.api()}`,
    );
  });

  it("reads launcher origin from sessionStorage in built mode", () => {
    env["DEV"] = false;
    windowStub.location.origin = "http://remote.example:7777";
    sessionStorageStub.setItem(
      "setta.launcherOrigin",
      "http://remote.example:9999",
    );

    expect(C_ADDRESSES.BACKEND_ORIGIN).toBe("http://remote.example:7777");
    expect(C_ADDRESSES.LAUNCHER_ORIGIN).toBe("http://remote.example:9999");
    expect(C_ADDRESSES.LAUNCHER).toBe(
      `http://remote.example:9999${GoRoutePrefixHelpers.api()}`,
    );
  });

  it("ignores a launcher origin with a mismatched hostname in built mode", () => {
    env["DEV"] = false;
    windowStub.location.origin = "http://remote.example:7777";
    sessionStorageStub.setItem(
      "setta.launcherOrigin",
      "http://attacker.example:9999",
    );

    expect(C_ADDRESSES.BACKEND_ORIGIN).toBe("http://remote.example:7777");
    expect(C_ADDRESSES.LAUNCHER_ORIGIN).toBe("http://remote.example:7777");
    expect(sessionStorageStub.getItem("setta.launcherOrigin")).toBe(
      "http://remote.example:7777",
    );
  });

  it("derives launcher origin hostname from the active backend origin in dev mode", () => {
    env["DEV"] = true;
    env["VITE_BACKEND_ORIGIN"] = "";
    sessionStorageStub.setItem(
      BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      "http://localhost:61000",
    );

    expect(C_ADDRESSES.BACKEND_ORIGIN).toBe("http://localhost:61000");
    expect(C_ADDRESSES.LAUNCHER_ORIGIN).toBe("http://localhost:8000");
  });
});
