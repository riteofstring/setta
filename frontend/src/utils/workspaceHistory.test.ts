import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encodeBase64Url } from "./base64Url";
import {
  consumeWorkspaceHistoryHandoff,
  loadWorkspaceHistory,
  upsertWorkspaceHistoryEntry,
  workspaceHistoryEntryKey,
  type WorkspaceHistoryEntry,
} from "./workspaceHistory";

describe("workspaceHistory", () => {
  let memoryStorage: Storage;
  let originalBtoa: unknown;
  let originalAtob: unknown;
  let originalWindow: unknown;

  beforeAll(() => {
    originalBtoa = (globalThis as { btoa?: unknown }).btoa;
    originalAtob = (globalThis as { atob?: unknown }).atob;
    originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { btoa?: unknown }).btoa = (value: string) =>
      Buffer.from(value, "binary").toString("base64");
    (globalThis as { atob?: unknown }).atob = (value: string) =>
      Buffer.from(value, "base64").toString("binary");

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
    (globalThis as { window?: unknown }).window = {
      localStorage: memoryStorage,
    };
  });

  beforeEach(() => {
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalBtoa === undefined) {
      delete (globalThis as { btoa?: unknown }).btoa;
    } else {
      (globalThis as { btoa?: unknown }).btoa = originalBtoa;
    }
    if (originalAtob === undefined) {
      delete (globalThis as { atob?: unknown }).atob;
    } else {
      (globalThis as { atob?: unknown }).atob = originalAtob;
    }
  });

  it("dedupes entries that only differ by trailing slashes", () => {
    const existing = [
      {
        workspaceRoot: "/tmp/work",
        sshTarget: null,
        localPort: null,
        settaFilesLocation: "auto",
        lastUsedAt: 1,
      },
    ] satisfies WorkspaceHistoryEntry[];
    const nextEntry = {
      ...existing[0],
      workspaceRoot: "/tmp/work/",
      lastUsedAt: 2,
    };

    const merged = upsertWorkspaceHistoryEntry(existing, nextEntry);
    expect(merged).toHaveLength(1);
    expect(merged[0].workspaceRoot).toBe("/tmp/work/");
  });

  it("dedupes entries that only differ by trailing backslashes", () => {
    const existing = [
      {
        workspaceRoot: "C:\\\\repo\\\\",
        sshTarget: null,
        localPort: null,
        settaFilesLocation: "auto",
        lastUsedAt: 1,
      },
    ] satisfies WorkspaceHistoryEntry[];
    const nextEntry = {
      ...existing[0],
      workspaceRoot: "C:\\\\repo",
      lastUsedAt: 2,
    };

    const merged = upsertWorkspaceHistoryEntry(existing, nextEntry);
    expect(merged).toHaveLength(1);
  });

  it("preserves windows drive roots when building keys", () => {
    const entry = {
      workspaceRoot: "C:\\",
      sshTarget: null,
      localPort: null,
      settaFilesLocation: "auto",
      lastUsedAt: 1,
    } satisfies WorkspaceHistoryEntry;
    const parsed = JSON.parse(workspaceHistoryEntryKey(entry));
    expect(parsed.workspaceRoot).toBe("C:\\");
  });

  it("avoids key collisions when values contain '::'", () => {
    const entryA = {
      workspaceRoot: "a",
      sshTarget: "b::c",
      localPort: null,
      settaFilesLocation: "auto",
      lastUsedAt: 1,
    } satisfies WorkspaceHistoryEntry;
    const entryB = {
      workspaceRoot: "a::b",
      sshTarget: "c",
      localPort: null,
      settaFilesLocation: "auto",
      lastUsedAt: 1,
    } satisfies WorkspaceHistoryEntry;

    expect(workspaceHistoryEntryKey(entryA)).not.toBe(
      workspaceHistoryEntryKey(entryB),
    );
  });

  it("dedupes entries that only differ by localPort", () => {
    const existing = [
      {
        workspaceRoot: "/tmp/work",
        sshTarget: "user@host",
        localPort: 61000,
        settaFilesLocation: "auto",
        lastUsedAt: 1,
      },
    ] satisfies WorkspaceHistoryEntry[];
    const nextEntry = {
      ...existing[0],
      localPort: 62000,
      lastUsedAt: 2,
    };

    const merged = upsertWorkspaceHistoryEntry(existing, nextEntry);
    expect(merged).toHaveLength(1);
    expect(merged[0].localPort).toBe(62000);
  });

  it("coerces partial entries from localStorage safely", () => {
    memoryStorage.setItem(
      "setta.workspaceHistory.v2",
      JSON.stringify([
        {
          workspaceRoot: " /tmp/work/ ",
          lastUsedAt: 123,
        },
        {
          workspaceRoot: "/tmp/invalid",
          lastUsedAt: "not-a-number",
        },
        {
          workspaceRoot: 42,
          lastUsedAt: 999,
        },
      ]),
    );

    const loaded = loadWorkspaceHistory();
    expect(loaded).toEqual([
      {
        workspaceRoot: "/tmp/work",
        sshTarget: null,
        localPort: null,
        settaFilesLocation: "auto",
        lastUsedAt: 123,
      },
    ]);
  });

  it("coerces localPort values", () => {
    memoryStorage.setItem(
      "setta.workspaceHistory.v2",
      JSON.stringify([
        {
          workspaceRoot: "/tmp/work",
          localPort: "54321",
          lastUsedAt: 1,
        },
        {
          workspaceRoot: "/tmp/work2",
          localPort: 70000,
          lastUsedAt: 2,
        },
      ]),
    );

    const loaded = loadWorkspaceHistory();
    expect(loaded[0]?.localPort).toBe(54321);
    expect(loaded[1]?.localPort).toBeNull();
  });

  it("consumes a workspace history handoff payload and merges entries", () => {
    memoryStorage.setItem(
      "setta.workspaceHistory.v2",
      JSON.stringify([
        {
          workspaceRoot: "/tmp/work",
          sshTarget: null,
          localPort: null,
          settaFilesLocation: "auto",
          lastUsedAt: 10,
        },
      ]),
    );
    const incoming = [
      {
        workspaceRoot: "/tmp/work",
        sshTarget: null,
        localPort: null,
        settaFilesLocation: "auto",
        lastUsedAt: 20,
      },
      {
        workspaceRoot: "/tmp/other",
        sshTarget: null,
        localPort: null,
        settaFilesLocation: "auto",
        lastUsedAt: 5,
      },
    ];
    const encoded = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify(incoming)),
    );
    memoryStorage.setItem("setta.workspaceHistoryHandoff.v2", encoded);

    consumeWorkspaceHistoryHandoff();

    expect(memoryStorage.getItem("setta.workspaceHistoryHandoff.v2")).toBeNull();
    const loaded = loadWorkspaceHistory();
    expect(loaded[0]?.workspaceRoot).toBe("/tmp/work");
    expect(loaded[0]?.lastUsedAt).toBe(20);
    expect(loaded.some((entry) => entry.workspaceRoot === "/tmp/other")).toBe(
      true,
    );
  });
});
