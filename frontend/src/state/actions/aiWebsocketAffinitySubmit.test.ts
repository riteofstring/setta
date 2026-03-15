import { resetProjectStores } from "state/utils";
import {
  route_get_agent_runs,
  route_get_llm_chat,
} from "utils/generatedEndpoints";
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

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
    route_get_llm_chat: vi.fn(),
    route_get_llm_response: vi.fn(),
  };
});

let submitMessage: typeof import("state/actions/aiChatSubmissionMessages").submitMessage;
const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);
const mockedRouteGetLLMChat = vi.mocked(route_get_llm_chat);
let memoryStorage: Storage;
const DRAFT_SURFACE_ID = "draft-surface-affinity";

describe("submitMessage websocket affinity", () => {
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
    const aiChatSubmissionMessages = await import(
      "state/actions/aiChatSubmissionMessages"
    );
    submitMessage = aiChatSubmissionMessages.submitMessage;
  });

  beforeEach(async () => {
    resetProjectStores();
    const { useAIStore } = await import("state/definitions");
    useAIStore.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem.bind(memoryStorage),
        setItem: memoryStorage.setItem.bind(memoryStorage),
        removeItem: memoryStorage.removeItem.bind(memoryStorage),
      },
    });
    vi.clearAllMocks();
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: {},
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

  it("blocks llm requests until the current websocket generation receives identity", async () => {
    const route_get_llm_response = (await import("utils/generatedEndpoints"))
      .route_get_llm_response as unknown as vi.Mock;
    const {
      setActiveFrontendWebsocketAffinityGeneration,
      setFrontendAffinityToken,
    } = await import("state/actions/frontendWebsocketAffinity");
    const returnedChatId = "chat-affinity-refresh";
    route_get_llm_response.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        chatId: returnedChatId,
        runId: "run-affinity-refresh",
        engineType: "setta_llm",
        sectionId: null,
      },
    });

    setActiveFrontendWebsocketAffinityGeneration(1);
    setFrontendAffinityToken("frontend-old", 1);
    setActiveFrontendWebsocketAffinityGeneration(2);

    await expect(
      submitMessage(
        null,
        "Run this request immediately.",
        [],
        true,
        "engine-primary",
        false,
        { pendingSurfaceId: DRAFT_SURFACE_ID },
      ),
    ).rejects.toThrow("Frontend identity not ready");
    expect(route_get_llm_response).toHaveBeenCalledTimes(0);

    setFrontendAffinityToken("frontend-new", 2);
    await expect(
      submitMessage(
        null,
        "Run this request after identity refresh.",
        [],
        true,
        "engine-primary",
        false,
        { pendingSurfaceId: DRAFT_SURFACE_ID },
      ),
    ).resolves.toBe(returnedChatId);
    const [secondPayload] = route_get_llm_response.mock.calls[0] as [
      { frontendAffinityToken: string },
    ];
    expect(secondPayload.frontendAffinityToken).toBe("frontend-new");
  });
});
