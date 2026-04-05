import { getLlmChat, getLlmResponse } from "openapi/http";
import { resetProjectStores } from "state/utils";
import { route_get_agent_runs } from "utils/generatedEndpoints";
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

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getLlmChat: vi.fn(),
    getLlmResponse: vi.fn(),
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

const mockedRouteGetLLMResponse = vi.mocked(getLlmResponse);
const mockedRouteGetLLMChat = vi.mocked(getLlmChat);

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
  };
});

const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);

let submitMessage: typeof import("state/actions/ai").submitMessage;
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
    const ai = await import("state/actions/ai");
    submitMessage = ai.submitMessage;
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
    const {
      setActiveFrontendWebsocketAffinityGeneration,
      setFrontendAffinityToken,
    } = await import("state/actions/frontendWebsocketAffinity");
    const returnedChatId = "chat-affinity-refresh";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: returnedChatId,
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
    expect(mockedRouteGetLLMResponse).toHaveBeenCalledTimes(0);

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
    const [request] = mockedRouteGetLLMResponse.mock.calls[0] as [
      { body: { frontendAffinityToken: string } },
    ];
    expect(request.body.frontendAffinityToken).toBe("frontend-new");
  });
});
