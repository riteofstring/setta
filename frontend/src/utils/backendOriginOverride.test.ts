import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  applyBackendOriginOverrideFromUrl,
  BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
} from "./backendOriginOverride";

describe("applyBackendOriginOverrideFromUrl", () => {
  let memoryStorage: Storage;
  let warnSpy: ReturnType<typeof vi.spyOn>;

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

    const windowStub = {
      location: {
        href: "http://localhost/",
      },
      history: {
        state: null as unknown,
        replaceState: function (
          state: unknown,
          _title: string,
          url: string | URL | null | undefined,
        ) {
          this.state = state;
          if (typeof url === "string") {
            windowStub.location.href = new URL(
              url,
              windowStub.location.href,
            ).toString();
          }
        },
      },
      sessionStorage: memoryStorage,
    };

    (globalThis as { window?: typeof windowStub }).window = windowStub;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage;
  });

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it("cleans the URL without clobbering history state", () => {
    const initialState = { from: "test" };
    window.history.state = initialState;
    window.location.href =
      "http://localhost/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8000#hash";
    memoryStorage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);

    applyBackendOriginOverrideFromUrl();

    expect(window.location.href).not.toContain("__setta_backend_origin");
    expect(window.history.state).toMatchObject({ from: "test" });
    expect(memoryStorage.getItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY)).toBe(
      "http://127.0.0.1:8000",
    );
  });

  it("rejects non-local hostname overrides by default", () => {
    window.location.href =
      "http://127.0.0.1/?__setta_backend_origin=https%3A%2F%2Fevil.example#hash";
    memoryStorage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);

    applyBackendOriginOverrideFromUrl();

    expect(window.location.href).not.toContain("__setta_backend_origin");
    expect(
      memoryStorage.getItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY),
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("allows non-local overrides when explicitly enabled", () => {
    const previous = import.meta.env.VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE;
    (import.meta.env as unknown as Record<string, unknown>)[
      "VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE"
    ] = "1";
    try {
      window.location.href =
        "http://127.0.0.1/?__setta_backend_origin=https%3A%2F%2Fevil.example#hash";
      memoryStorage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);

      applyBackendOriginOverrideFromUrl();

      expect(window.location.href).not.toContain("__setta_backend_origin");
      expect(memoryStorage.getItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY)).toBe(
        "https://evil.example",
      );
    } finally {
      (import.meta.env as unknown as Record<string, unknown>)[
        "VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE"
      ] = previous;
    }
  });
});
