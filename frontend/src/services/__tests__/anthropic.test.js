import { fetchEventSource } from "@microsoft/fetch-event-source";
import { getAvailableModels, sendMessage } from "services/aiService";

// Mock the fetch-event-source module
jest.mock("@microsoft/fetch-event-source");

// Mock local storage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

// Apply the mock to window.localStorage
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("Anthropic API Integration", () => {
  beforeEach(() => {
    fetchEventSource.mockClear();
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it("should send a message to Anthropic API with correct headers", async () => {
    // Setup API key in localStorage
    const anthropicApiKey = "test-anthropic-key";
    localStorageMock.setItem(
      "llm_service_keys",
      JSON.stringify({ anthropic: anthropicApiKey }),
    );

    // Create mock callbacks
    const onMessage = jest.fn();
    const onStart = jest.fn();
    const onError = jest.fn();
    const onComplete = jest.fn();

    // Call the function
    await sendMessage({
      message: "Hello, Claude!",
      model: "claude-3-opus",
      onMessage,
      onStart,
      onError,
      onComplete,
    });

    // Check if fetchEventSource was called with correct parameters
    expect(fetchEventSource).toHaveBeenCalledTimes(1);
    const [url, options] = fetchEventSource.mock.calls[0];

    // Verify URL
    expect(url).toBe("/api/chat");

    // Verify headers contain the API key
    expect(options.headers.Authorization).toBe(`Bearer ${anthropicApiKey}`);

    // Verify body contains the correct model
    expect(JSON.parse(options.body).model).toBe("claude-3-opus");
    expect(JSON.parse(options.body).message).toBe("Hello, Claude!");
  });

  it("should handle errors when no API key is provided", async () => {
    // No API key in localStorage

    // Create mock callbacks
    const onMessage = jest.fn();
    const onStart = jest.fn();
    const onError = jest.fn();
    const onComplete = jest.fn();

    // Call the function
    await sendMessage({
      message: "Hello, Claude!",
      model: "claude-3-opus",
      onMessage,
      onStart,
      onError,
      onComplete,
    });

    // Check if error callback was called
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain("No API key found");

    // Check if complete callback was called
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Check that fetchEventSource was NOT called
    expect(fetchEventSource).not.toHaveBeenCalled();
  });

  it("should filter models based on available API keys", async () => {
    // Set up API keys
    localStorageMock.setItem(
      "llm_service_keys",
      JSON.stringify({
        anthropic: "test-anthropic-key",
        openai: "test-openai-key",
      }),
    );

    // Mock fetch for API call to /api/models
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "claude-3-opus",
              name: "Claude 3 Opus",
              serviceId: "anthropic",
            },
            {
              id: "claude-3-sonnet",
              name: "Claude 3 Sonnet",
              serviceId: "anthropic",
            },
            { id: "gpt-4", name: "GPT-4", serviceId: "openai" },
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", serviceId: "openai" },
            { id: "mixtral", name: "Mixtral 8x7B", serviceId: "together" },
          ]),
      }),
    );

    // Get available models
    const models = await getAvailableModels();

    // Check that only models with API keys are included
    const filteredModels = models.filter((model) =>
      ["anthropic", "openai"].includes(model.serviceId),
    );

    // Make sure all Anthropic models were included
    const anthropicModels = models.filter(
      (model) => model.serviceId === "anthropic",
    );
    expect(anthropicModels.length).toBe(2);

    // Make sure the "together" model was excluded (no API key)
    const togetherModels = models.filter(
      (model) => model.serviceId === "together",
    );
    expect(togetherModels.length).toBe(0);

    // Clean up
    global.fetch.mockClear();
    delete global.fetch;
  });
});
