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

  it("preserves read-after-write when setItem fails but getItem still works", async () => {
    const storage = buildMemoryStorage();
    const mixedStorage: StorageMock = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: storage.removeItem,
    };
    setGlobalLocalStorage(mixedStorage);

    const { getSafeLocalStorageAdapter } = await import("./safeLocalStorage");
    const adapter = getSafeLocalStorageAdapter("partial-write-failure");

    adapter.setItem("gamma", "3");
    expect(adapter.getItem("gamma")).toBe("3");
    expect(storage.getItem("gamma")).toBeNull();
  });

  it("preserves read-after-remove when removeItem fails but getItem still works", async () => {
    const storage = buildMemoryStorage();
    storage.setItem("delta", "4");
    const mixedStorage: StorageMock = {
      getItem: storage.getItem,
      setItem: storage.setItem,
      removeItem: (key) => {
        if (key !== "delta") {
          storage.removeItem(key);
          return;
        }
        throw new Error("remove blocked");
      },
    };
    setGlobalLocalStorage(mixedStorage);

    const { getSafeLocalStorageAdapter } = await import("./safeLocalStorage");
    const adapter = getSafeLocalStorageAdapter("partial-remove-failure");

    expect(adapter.getItem("delta")).toBe("4");
    adapter.removeItem("delta");
    expect(adapter.getItem("delta")).toBeNull();
    expect(storage.getItem("delta")).toBe("4");
  });

  it("maintains overlay ordering across mixed storage success and failure", async () => {
    const storage = buildMemoryStorage();
    const failingKeys = new Set<string>(["epsilon"]);
    const mixedStorage: StorageMock = {
      getItem: storage.getItem,
      setItem: (key, value) => {
        if (failingKeys.has(key)) {
          throw new Error("write blocked");
        }
        storage.setItem(key, value);
      },
      removeItem: (key) => {
        if (failingKeys.has(key)) {
          throw new Error("remove blocked");
        }
        storage.removeItem(key);
      },
    };
    setGlobalLocalStorage(mixedStorage);

    const { getSafeLocalStorageAdapter } = await import("./safeLocalStorage");
    const adapter = getSafeLocalStorageAdapter("mixed-sequence");

    adapter.setItem("epsilon", "first");
    expect(adapter.getItem("epsilon")).toBe("first");

    failingKeys.delete("epsilon");
    adapter.setItem("epsilon", "second");
    expect(adapter.getItem("epsilon")).toBe("second");
    expect(storage.getItem("epsilon")).toBe("second");

    failingKeys.add("epsilon");
    adapter.removeItem("epsilon");
    expect(adapter.getItem("epsilon")).toBeNull();
    expect(storage.getItem("epsilon")).toBe("second");
  });
});
