import { fetchEventSource } from "@microsoft/fetch-event-source";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableModels, sendMessage } from "../aiService";

// Mock fetch-event-source module
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("aiService", () => {
  // Setup and teardown
  beforeEach(() => {
    vi.resetAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendMessage", () => {
    it("should set up and call fetchEventSource with correct parameters", async () => {
      // Setup API key in localStorage
      localStorageMock.setItem(
        "llm_service_keys",
        JSON.stringify({
          gpt: "test-api-key",
        }),
      );

      // Mock implementation of fetchEventSource
      const mockController = { abort: vi.fn() };
      global.AbortController = vi.fn(() => mockController);

      const onMessageMock = vi.fn();
      const onStartMock = vi.fn();
      const onErrorMock = vi.fn();
      const onCompleteMock = vi.fn();

      // Mock successful response
      fetchEventSource.mockImplementation(async (_url, options) => {
        // Simulate opening the connection
        options.onOpen({ ok: true, status: 200 });

        // Simulate receiving messages
        options.onMessage({
          data: '{"content": "Hello"}',
        });
        options.onMessage({
          data: '{"content": " world"}',
        });
        options.onMessage({
          data: '{"content": "!", "reasoning": "Simple greeting"}',
        });

        // Simulate end of stream
        options.onClose();
      });

      // Call the function under test
      await sendMessage({
        message: "Test message",
        model: "gpt-3.5-turbo",
        onMessage: onMessageMock,
        onStart: onStartMock,
        onError: onErrorMock,
        onComplete: onCompleteMock,
      });

      // Verify fetchEventSource was called with expected parameters
      expect(fetchEventSource).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          }),
          body: expect.any(String),
        }),
      );

      // Verify the body was properly serialized
      const body = JSON.parse(fetchEventSource.mock.calls[0][1].body);
      expect(body).toEqual({
        message: "Test message",
        model: "gpt-3.5-turbo",
      });

      // Verify callbacks were called
      expect(onStartMock).toHaveBeenCalledTimes(1);
      expect(onMessageMock).toHaveBeenCalledTimes(3);
      expect(onMessageMock).toHaveBeenCalledWith("Hello");
      expect(onMessageMock).toHaveBeenCalledWith(" world");
      expect(onMessageMock).toHaveBeenCalledWith("!");
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(onCompleteMock).toHaveBeenCalledWith("Simple greeting");
    });

    it("should handle missing API key gracefully", async () => {
      // No API key in localStorage
      const onErrorMock = vi.fn();
      const onCompleteMock = vi.fn();

      // Call the function under test
      const controller = await sendMessage({
        message: "Test message",
        model: "gpt-3.5-turbo",
        onError: onErrorMock,
        onComplete: onCompleteMock,
      });

      // Verify error callback was called with appropriate message
      expect(onErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("No API key found"),
        }),
      );

      // Verify complete callback was called
      expect(onCompleteMock).toHaveBeenCalledWith(null);

      // Verify fetchEventSource was not called
      expect(fetchEventSource).not.toHaveBeenCalled();

      // Verify controller was returned
      expect(controller).toBeDefined();
      expect(controller.abort).toBeDefined();
    });

    it("should handle errors properly", async () => {
      // Setup API key in localStorage
      localStorageMock.setItem(
        "llm_service_keys",
        JSON.stringify({
          gpt: "test-api-key",
        }),
      );

      // Mock implementation that throws an error
      fetchEventSource.mockImplementation(async (_url, options) => {
        options.onError(new Error("Network error"));
      });

      const onErrorMock = vi.fn();
      const onCompleteMock = vi.fn();

      // Call the function
      await sendMessage({
        message: "Test message",
        model: "gpt-3.5-turbo",
        onError: onErrorMock,
        onComplete: onCompleteMock,
      });

      // Verify error callback was called
      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAvailableModels", () => {
    it("should return a list of available models", async () => {
      // Setup API keys in localStorage
      localStorageMock.setItem(
        "llm_service_keys",
        JSON.stringify({
          openai: "test-openai-key",
          anthropic: "test-anthropic-key",
        }),
      );

      // Mock fetch implementation
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockResolvedValue([{ id: "custom-model", name: "Custom Model" }]),
      });

      const models = await getAvailableModels();

      expect(fetch).toHaveBeenCalledWith("/api/models");

      // Should include default models with API keys and backend models
      expect(models).toContainEqual(expect.objectContaining({ id: "gpt-4" }));
      expect(models).toContainEqual(
        expect.objectContaining({ id: "claude-3-opus" }),
      );
      expect(models).toContainEqual(
        expect.objectContaining({ id: "custom-model" }),
      );
    });

    it("should handle errors when fetching models", async () => {
      // Setup API keys in localStorage
      localStorageMock.setItem(
        "llm_service_keys",
        JSON.stringify({
          openai: "test-openai-key",
          anthropic: "test-anthropic-key",
        }),
      );

      // Mock fetch implementation that throws
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Should not throw but return default models
      const models = await getAvailableModels();

      // Should still include default models with API keys
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContainEqual(expect.objectContaining({ id: "gpt-4" }));
    });
  });
});
