import { afterEach, describe, expect, it, vi } from "vitest";

type StorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function buildMemoryStorage(): StorageMock {
  const storage = new Map<string, string>();
  return {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  };
}

function setGlobalLocalStorage(storage: StorageMock): void {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

describe("getSafeLocalStorageAdapter", () => {
  const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );

  afterEach(() => {
    vi.resetModules();
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(
        globalThis,
        "localStorage",
        originalLocalStorageDescriptor,
      );
      return;
    }
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("uses browser storage when available", async () => {
    const storage = buildMemoryStorage();
    setGlobalLocalStorage(storage);

    const { getSafeLocalStorageAdapter } = await import("./safeLocalStorage");
    const adapter = getSafeLocalStorageAdapter("available");

    adapter.setItem("alpha", "1");

    expect(adapter.getItem("alpha")).toBe("1");
    expect(storage.getItem("alpha")).toBe("1");
  });

  it("falls back to in-memory storage when localStorage access throws", async () => {
    const throwingStorage: StorageMock = {
      getItem: () => {
        throw new Error("getItem blocked");
      },
      setItem: () => {
        throw new Error("setItem blocked");
      },
      removeItem: () => {
        throw new Error("removeItem blocked");
      },
    };
    setGlobalLocalStorage(throwingStorage);

    const { getSafeLocalStorageAdapter } = await import("./safeLocalStorage");
    const adapter = getSafeLocalStorageAdapter("blocked");

    expect(() => adapter.setItem("beta", "2")).not.toThrow();
    expect(adapter.getItem("beta")).toBe("2");
    expect(() => adapter.removeItem("beta")).not.toThrow();
    expect(adapter.getItem("beta")).toBeNull();
  });
});
