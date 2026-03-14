import { resetProjectStores } from "state/utils";
import { ChatRoleEnum, createMessageTextContent } from "utils/generatedTypes";
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
let submitEditedMessage: typeof import("state/actions/ai").submitEditedMessage;
let getDefaultChatDetails: typeof import("state/actions/ai").getDefaultChatDetails;
let memoryStorage: Storage;

const chatId = "chat-1";
const OTHER_SURFACE_ID = "surface-other";
const TARGET_SURFACE_ID = "surface-target";

describe("submitEditedMessage", () => {
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
    const ai = await import("state/actions/ai");
    submitEditedMessage = ai.submitEditedMessage;
    getDefaultChatDetails = ai.getDefaultChatDetails;
  });

  beforeEach(() => {
    resetProjectStores();
    useAIStore.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem.bind(memoryStorage),
        setItem: memoryStorage.setItem.bind(memoryStorage),
        removeItem: memoryStorage.removeItem.bind(memoryStorage),
      },
    });
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("returns null without mutating surface-scoped pending state when message id is missing", async () => {
    useAIStore.setState({
      activeChatId: chatId,
      pendingChatDetailsBySurfaceId: {
        [OTHER_SURFACE_ID]: {
          ...getDefaultChatDetails(),
          messages: [],
        },
      },
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
        },
      },
    });

    const result = await submitEditedMessage({
      parentChatId: chatId,
      messages: [
        {
          id: "msg-1",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Original" })],
          attachments: [],
        },
      ],
      messageId: "missing",
      message: "Edited",
      attachments: [],
      thinking: false,
      engineConfigId: "engine-1",
      isExternalEngine: false,
      agentProfileId: null,
      sectionId: null,
      pendingSurfaceId: TARGET_SURFACE_ID,
    });

    expect(result).toBeNull();
    const state = useAIStore.getState();
    expect(state.activeChatId).toBe(chatId);
    expect(
      state.pendingChatDetailsBySurfaceId[TARGET_SURFACE_ID],
    ).toBeUndefined();
    expect(state.pendingChatDetailsBySurfaceId[OTHER_SURFACE_ID]).toMatchObject(
      {
        messages: [],
      },
    );
  });
});
