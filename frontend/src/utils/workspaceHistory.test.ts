import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  loadWorkspaceHistory,
  upsertWorkspaceHistoryEntry,
  workspaceHistoryEntryKey,
} from "./workspaceHistory";

describe("workspaceHistory", () => {
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

  it("dedupes entries that only differ by trailing slashes", () => {
    const existing = [
      {
        workspaceRoot: "/tmp/work",
        sshTarget: null,
        localPort: null,
        filesRoot: null,
        filesRootBase: null,
        lastUsedAt: 1,
      },
    ];
    const nextEntry = {
      ...existing[0],
      workspaceRoot: "/tmp/work/",
      lastUsedAt: 2,
    };

    const merged = upsertWorkspaceHistoryEntry(existing, nextEntry);
    expect(merged).toHaveLength(1);
    expect(merged[0].workspaceRoot).toBe("/tmp/work/");
  });

  it("avoids key collisions when values contain '::'", () => {
    const entryA = {
      workspaceRoot: "a",
      sshTarget: "b::c",
      localPort: null,
      filesRoot: null,
      filesRootBase: null,
      lastUsedAt: 1,
    };
    const entryB = {
      workspaceRoot: "a::b",
      sshTarget: "c",
      localPort: null,
      filesRoot: null,
      filesRootBase: null,
      lastUsedAt: 1,
    };

    expect(workspaceHistoryEntryKey(entryA)).not.toBe(
      workspaceHistoryEntryKey(entryB),
    );
  });

  it("coerces partial entries from localStorage safely", () => {
    memoryStorage.setItem(
      "setta.workspaceHistory",
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
        filesRoot: null,
        filesRootBase: null,
        lastUsedAt: 123,
      },
    ]);
  });

  it("coerces localPort values", () => {
    memoryStorage.setItem(
      "setta.workspaceHistory",
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
});
