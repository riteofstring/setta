import { fetchEventSource } from "@microsoft/fetch-event-source";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableModels, sendMessage } from "../aiService";

// Mock fetch-event-source module
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: vi.fn(),
}));

describe("aiService", () => {
  // Setup and teardown
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendMessage", () => {
    it("should set up and call fetchEventSource with correct parameters", async () => {
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
          data: '{"role": "assistant", "content": "Hello"}',
        });
        options.onMessage({
          data: '{"role": "assistant", "content": " world"}',
        });
        options.onMessage({
          data: '{"role": "assistant", "content": "!", "reasoning": "Simple greeting"}',
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

    it("should handle errors properly", async () => {
      // Mock implementation that throws an error
      fetchEventSource.mockImplementation(async (_url, options) => {
        options.onOpen({ ok: false, status: 500 });
        throw new Error("Network error");
      });

      const onErrorMock = vi.fn();

      // Call the function under test and expect it to reject
      await expect(
        sendMessage({
          message: "Test message",
          model: "gpt-3.5-turbo",
          onError: onErrorMock,
        }),
      ).rejects.toThrow();

      // Verify error callback was called
      expect(onErrorMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAvailableModels", () => {
    it("should return a list of available models", async () => {
      // Mock fetch implementation
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          { id: "gpt-3.5-turbo", name: "GPT-3.5" },
          { id: "gpt-4", name: "GPT-4" },
        ]),
      });

      const models = await getAvailableModels();

      expect(fetch).toHaveBeenCalledWith("/api/models");
      expect(models).toEqual([
        { id: "gpt-3.5-turbo", name: "GPT-3.5" },
        { id: "gpt-4", name: "GPT-4" },
      ]);
    });

    it("should handle errors when fetching models", async () => {
      // Mock fetch implementation that throws
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(getAvailableModels()).rejects.toThrow("Network error");
    });
  });
});
