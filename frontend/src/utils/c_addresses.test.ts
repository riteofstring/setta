import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY } from "./backendOriginOverride";
import { C } from "./c";
import { C_ADDRESSES } from "./c_addresses";

describe("C_ADDRESSES", () => {
  let memoryStorage: Storage;

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
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage;
  });

  afterAll(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it("rejects non-http(s) backend origin overrides from sessionStorage", () => {
    const originalDevMode = C_ADDRESSES.DEV_MODE;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      C_ADDRESSES.DEV_MODE = true;
      memoryStorage.setItem(
        BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
        "ws://127.0.0.1:8000",
      );

      expect(C_ADDRESSES.BACKEND_ORIGIN).toBe(
        `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`,
      );
    } finally {
      errorSpy.mockRestore();
      memoryStorage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
      C_ADDRESSES.DEV_MODE = originalDevMode;
    }
  });

  it("normalizes sessionStorage overrides missing a protocol", () => {
    const originalDevMode = C_ADDRESSES.DEV_MODE;
    try {
      C_ADDRESSES.DEV_MODE = true;
      memoryStorage.setItem(
        BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
        "127.0.0.1:54321",
      );

      expect(C_ADDRESSES.BACKEND_ORIGIN).toBe("http://127.0.0.1:54321");
    } finally {
      memoryStorage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
      C_ADDRESSES.DEV_MODE = originalDevMode;
    }
  });
});
