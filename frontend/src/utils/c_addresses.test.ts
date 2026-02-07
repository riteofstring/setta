import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY } from "./backendOriginOverride";
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
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage;
  });

  beforeEach(() => {
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("uses a localStorage backend origin override in dev mode", () => {
    C_ADDRESSES.DEV_MODE = true;
    memoryStorage.setItem(
      BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      "127.0.0.1:54321",
    );

    expect(C_ADDRESSES.BACKEND_ORIGIN).toBe("http://127.0.0.1:54321");
  });
});
