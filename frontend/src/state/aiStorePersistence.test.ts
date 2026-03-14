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

let useAIStore: typeof import("state/stores/aiStore").useAIStore;
let memoryStorage: Storage;

type PersistedAIStoreSlice = {
  viewThreads?: boolean;
  projectChatThreadsExplicitlyClosedAtLargeWidth?: boolean;
  projectChatActivityAccordionOpenByDefault?: boolean;
  projectChatActivityChildrenOpenByDefault?: boolean;
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

    const aiStore = await import("state/stores/aiStore");
    useAIStore = aiStore.useAIStore;
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
      viewThreads: true,
      projectChatThreadsExplicitlyClosedAtLargeWidth: true,
      projectChatActivityAccordionOpenByDefault: true,
      projectChatActivityChildrenOpenByDefault: true,
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

    expect(parsed.state.viewThreads).toBe(true);
    expect(parsed.state.projectChatThreadsExplicitlyClosedAtLargeWidth).toBe(
      true,
    );
    expect(parsed.state.projectChatActivityAccordionOpenByDefault).toBe(true);
    expect(parsed.state.projectChatActivityChildrenOpenByDefault).toBe(true);
    expect(parsed.state.projectChatDictationMode).toBe("provider");
    expect(parsed.state.projectChatSelectedEngineId).toBe("engine-codex");
    expect(parsed.state.activeChatId).toBeUndefined();
  });

  it("ignores legacy persisted viewHistory key during hydration", async () => {
    useAIStore.setState({ viewThreads: false });
    memoryStorage.setItem(
      "setta_ai_data",
      JSON.stringify({
        state: {
          viewHistory: true,
          projectChatDictationMode: "auto",
        },
        version: 0,
      }),
    );

    await useAIStore.persist.rehydrate();
    const state = useAIStore.getState();
    expect(state.viewThreads).toBe(false);
  });

  it("hydrates viewThreads from persisted viewThreads only", async () => {
    useAIStore.setState({ viewThreads: false });
    memoryStorage.setItem(
      "setta_ai_data",
      JSON.stringify({
        state: {
          viewThreads: true,
          projectChatDictationMode: "auto",
        },
        version: 0,
      }),
    );

    await useAIStore.persist.rehydrate();
    const state = useAIStore.getState();
    expect(state.viewThreads).toBe(true);
  });
});
