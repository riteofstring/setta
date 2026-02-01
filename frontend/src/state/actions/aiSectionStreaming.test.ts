import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let receiveLLMResponseChunk: typeof import("./ai").receiveLLMResponseChunk;
let useAIStore: typeof import("state/definitions").useAIStore;
let useProjectState: typeof import("state/definitions").useProjectState;

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const chatId = "chat-1";

function seedChatSection({
  chatId: initialChatId,
}: {
  chatId: string | null;
}) {
  const sectionCore = createCore({
    id: sectionId,
    name: "Chat",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Chat Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: initialChatId }),
    {
      id: implId,
      chatId: initialChatId,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  );
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.previewSectionVariantMap = {};
  });
}

describe("section chat streaming updates", () => {
  let memoryStorage: Storage;

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
    useProjectState = definitions.useProjectState;
    receiveLLMResponseChunk = (await import("./ai")).receiveLLMResponseChunk;
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
    useAIStore.setState({ chatDetails: {}, pendingChatDetails: null });
    seedChatSection({ chatId });
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("updates chatDetails when streaming includes sectionId", () => {
    const assistantMessage = {
      id: "msg-1",
      role: ChatRoleEnum.assistant,
      content: [{ type: "text", text: "Hello there" }],
      attachments: [],
      tool_calls: null,
    };

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: assistantMessage,
      },
    });

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details).toBeTruthy();
    expect(details.messages.some((message) => {
      if (message.role !== ChatRoleEnum.assistant) {
        return false;
      }
      return message.content?.some(
        (content) => content.type === "text" && content.text === "Hello there",
      );
    })).toBe(true);
    expect(details.waitingForResponse).toBe(false);
  });
});
