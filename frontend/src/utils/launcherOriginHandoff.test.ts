import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { applyLauncherOriginHandoffFromUrl } from "./launcherOriginHandoff";

describe("applyLauncherOriginHandoffFromUrl", () => {
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
        href: "http://127.0.0.1:3035/",
        origin: "http://127.0.0.1:3035",
        replace: (url: string | URL) => {
          windowStub.location.href = new URL(
            url,
            windowStub.location.href,
          ).toString();
        },
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
    (globalThis as { location?: typeof windowStub.location }).location =
      windowStub.location;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { location?: unknown }).location;
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it("stores launcher origin from the URL hash and cleans the handoff params", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.state = { from: "test" };
    window.location.href =
      "http://127.0.0.1:3035/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8035#lo=http%3A%2F%2F127.0.0.1%3A8035&lop=proof&rest=1";

    applyLauncherOriginHandoffFromUrl();

    expect(memoryStorage.getItem("setta.launcherOrigin")).toBe(
      "http://127.0.0.1:8035",
    );
    expect(window.location.href).not.toContain("lo=");
    expect(window.location.href).not.toContain("lop=");
    expect(window.location.href).toContain("#rest=1");
    expect(window.history.state).toMatchObject({ from: "test" });
  });

  it("cleans the hash without storing when the proof is missing", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.location.href =
      "http://127.0.0.1:3035/#lo=http%3A%2F%2F127.0.0.1%3A8035";

    applyLauncherOriginHandoffFromUrl();

    expect(memoryStorage.getItem("setta.launcherOrigin")).toBeNull();
    expect(window.location.href).not.toContain("lo=");
  });
});
