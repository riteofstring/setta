import { resetProjectStores } from "state/utils";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

let useAIStore: typeof import("state/definitions").useAIStore;
let memoryStorage: Storage;

type PersistedAIStoreSlice = {
  viewHistory?: boolean;
  projectChatDictationMode?: "auto" | "browser" | "provider";
  projectChatSelectedEngineId?: string | null;
  [key: string]: unknown;
};

describe("useAIStore persistence", () => {
  beforeAll(async () => {
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

    const definitions = await import("state/definitions");
    useAIStore = definitions.useAIStore;
  });

  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("stores project chat engine selection in the persisted ai slice", () => {
    // Engine selection should survive refresh via the persisted AI store slice.
    useAIStore.setState({
      activeChatId: "chat-not-persisted",
      viewHistory: true,
      projectChatDictationMode: "provider",
      projectChatSelectedEngineId: "engine-codex",
    });

    const persistedRaw = memoryStorage.getItem("setta_ai_data");
    expect(persistedRaw).not.toBeNull();
    if (!persistedRaw) {
      return;
    }
    const parsed = JSON.parse(persistedRaw) as {
      state: PersistedAIStoreSlice;
    };

    expect(parsed.state.viewHistory).toBe(true);
    expect(parsed.state.projectChatDictationMode).toBe("provider");
    expect(parsed.state.projectChatSelectedEngineId).toBe("engine-codex");
    expect(parsed.state.activeChatId).toBeUndefined();
  });
});
