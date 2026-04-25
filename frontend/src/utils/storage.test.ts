import {
  safeLocalStorage,
  safeSessionStorage,
} from "@setta/app-subsystem-frontend-sdk";
import { afterEach, describe, expect, it } from "vitest";

function buildMemoryStorage(): Storage {
  const storage = new Map<string, string>();
  return {
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
}

describe("safeSessionStorage", () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
      return;
    }
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it("returns undefined when window is missing", () => {
    delete (globalThis as unknown as { window?: unknown }).window;

    expect(safeSessionStorage()).toBeUndefined();
  });

  it("returns undefined when sessionStorage access throws", () => {
    (globalThis as unknown as { window?: unknown }).window = {};
    expect(typeof window).not.toBe("undefined");
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("blocked");
      },
      configurable: true,
    });

    expect(safeSessionStorage()).toBeUndefined();
  });

  it("returns sessionStorage when accessible", () => {
    const memory = buildMemoryStorage();
    (globalThis as unknown as { window?: unknown }).window = {
      sessionStorage: memory,
    };
    expect(typeof window).not.toBe("undefined");

    expect(safeSessionStorage()).toBe(memory);
  });
});

describe("safeLocalStorage", () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
      return;
    }
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it("returns undefined when window is missing", () => {
    delete (globalThis as unknown as { window?: unknown }).window;

    expect(safeLocalStorage()).toBeUndefined();
  });

  it("returns undefined when localStorage access throws", () => {
    (globalThis as unknown as { window?: unknown }).window = {};
    expect(typeof window).not.toBe("undefined");
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
      configurable: true,
    });

    expect(safeLocalStorage()).toBeUndefined();
  });

  it("returns localStorage when accessible", () => {
    const memory = buildMemoryStorage();
    (globalThis as unknown as { window?: unknown }).window = {
      localStorage: memory,
    };
    expect(typeof window).not.toBe("undefined");

    expect(safeLocalStorage()).toBe(memory);
  });
});
