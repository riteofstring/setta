import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { applyWorkspaceHistoryHandoffFromUrl } from "./workspaceHistory";

describe("applyWorkspaceHistoryHandoffFromUrl", () => {
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
      localStorage: memoryStorage,
    };

    (globalThis as { window?: typeof windowStub }).window = windowStub;
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("stores the handoff payload from the URL and cleans the query param", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.state = { from: "test" };
    window.location.href =
      "http://localhost/?__setta_workspace_history=payload#hash";

    applyWorkspaceHistoryHandoffFromUrl();

    expect(memoryStorage.getItem("setta.workspaceHistoryHandoff")).toBe(
      "payload",
    );
    expect(window.location.href).not.toContain("__setta_workspace_history");
    expect(window.history.state).toMatchObject({ from: "test" });
  });

  it("drops oversized payloads but still cleans the query param", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.location.href = `http://localhost/?__setta_workspace_history=${"a".repeat(8193)}#hash`;

    applyWorkspaceHistoryHandoffFromUrl();

    expect(memoryStorage.getItem("setta.workspaceHistoryHandoff")).toBeNull();
    expect(window.location.href).not.toContain("__setta_workspace_history");
  });
});
