import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApiKey,
  getAvailableModels,
  getModelServiceId,
  sendMessageWithVercel,
} from "../vercelAIService";

// Mock fetch function
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Vercel AI Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getModelServiceId", () => {
    it("should identify anthropic models correctly", () => {
      expect(getModelServiceId("claude-3-sonnet")).toBe("anthropic");
      expect(getModelServiceId("claude-3-opus-20240229")).toBe("anthropic");
      expect(getModelServiceId("claude-3-haiku")).toBe("anthropic");
    });

    it("should identify openai models correctly", () => {
      expect(getModelServiceId("gpt-4")).toBe("openai");
      expect(getModelServiceId("gpt-3.5-turbo")).toBe("openai");
    });

    it("should identify other model types", () => {
      expect(getModelServiceId("mixtral-8x7b")).toBe("together");
      expect(getModelServiceId("mistral-medium")).toBe("together");
      expect(getModelServiceId("llama-3-70b")).toBe("meta");
    });

    it("should return null for unknown models", () => {
      expect(getModelServiceId("unknown-model")).toBeNull();
    });
  });

  describe("getApiKey", () => {
    it("should retrieve API key for a service", () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          openai: "sk-openai-key",
          anthropic: "sk-anthropic-key",
        }),
      );

      expect(getApiKey("openai")).toBe("sk-openai-key");
      expect(getApiKey("anthropic")).toBe("sk-anthropic-key");
    });

    it("should return null if no API key is found", () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          openai: "sk-openai-key",
        }),
      );

      expect(getApiKey("anthropic")).toBeNull();
    });

    it("should return null if localStorage is empty", () => {
      localStorageMock.getItem.mockReturnValue(null);
      expect(getApiKey("openai")).toBeNull();
    });

    it("should handle JSON parsing errors", () => {
      localStorageMock.getItem.mockReturnValue("invalid-json");
      expect(getApiKey("openai")).toBeNull();
    });
  });

  describe("sendMessageWithVercel", () => {
    const readableStreamMock = (chunks) => {
      let chunkIndex = 0;
      return {
        getReader: () => ({
          read: () => {
            if (chunkIndex < chunks.length) {
              const value = chunks[chunkIndex];
              chunkIndex++;
              return Promise.resolve({ done: false, value });
            }
            return Promise.resolve({ done: true });
          },
        }),
      };
    };

    it("should send a message and process response chunks", async () => {
      // Setup mocks
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          anthropic: "sk-anthropic-key",
        }),
      );

      const chunks = [
        new TextEncoder().encode('data: {"content":"Hello"}\n'),
        new TextEncoder().encode('data: {"content":" World"}\n'),
        new TextEncoder().encode("[DONE]"),
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: readableStreamMock(chunks),
      });

      const onStart = vi.fn();
      const onMessage = vi.fn();
      const onError = vi.fn();
      const onFinish = vi.fn();

      // Call the function
      await sendMessageWithVercel({
        message: "Hi there",
        model: "claude-3-sonnet",
        onStart,
        onMessage,
        onError,
        onFinish,
      });

      // Verify API request
      expect(fetch).toHaveBeenCalledWith("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-anthropic-key",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hi there" }],
          model: "claude-3-sonnet",
        }),
        signal: expect.any(Object),
      });

      // Verify callbacks
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledTimes(2);
      expect(onMessage).toHaveBeenNthCalledWith(1, "Hello");
      expect(onMessage).toHaveBeenNthCalledWith(2, "Hello World");
      expect(onError).not.toHaveBeenCalled();
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("should handle API errors", async () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          anthropic: "sk-anthropic-key",
        }),
      );

      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const onStart = vi.fn();
      const onMessage = vi.fn();
      const onError = vi.fn();
      const onFinish = vi.fn();

      await sendMessageWithVercel({
        message: "Hi there",
        model: "claude-3-sonnet",
        onStart,
        onMessage,
        onError,
        onFinish,
      });

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onMessage).not.toHaveBeenCalled();
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("should handle missing API key", async () => {
      localStorageMock.getItem.mockReturnValue(null);

      const onStart = vi.fn();
      const onMessage = vi.fn();
      const onError = vi.fn();
      const onFinish = vi.fn();

      await sendMessageWithVercel({
        message: "Hi there",
        model: "claude-3-sonnet",
        onStart,
        onMessage,
        onError,
        onFinish,
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(onStart).not.toHaveBeenCalled();
      expect(onMessage).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "No API key found for claude-3-sonnet",
          ),
        }),
      );
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAvailableModels", () => {
    it("should filter models based on available API keys", async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === "llm_service_keys") {
          return JSON.stringify({
            anthropic: "sk-anthropic-key",
          });
        }
        return null;
      });

      global.fetch.mockResolvedValue({
        ok: false,
      });

      const models = await getAvailableModels();

      // Should only include anthropic models
      expect(
        models.every(
          (model) => model.serviceId === "anthropic" || !model.serviceId,
        ),
      ).toBe(true);

      // Should not include openai models
      expect(models.some((model) => model.serviceId === "openai")).toBe(false);
    });

    it("should include models from backend when available", async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === "llm_service_keys") {
          return JSON.stringify({
            anthropic: "sk-anthropic-key",
            openai: "sk-openai-key",
          });
        }
        return null;
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "custom-model", name: "Custom Model", serviceId: "custom" },
          ]),
      });

      const models = await getAvailableModels();

      // Should include the custom model from backend
      expect(models.some((model) => model.id === "custom-model")).toBe(true);
    });
  });
});
