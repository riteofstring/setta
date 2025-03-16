import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../chat";

// Mock the ai library
vi.mock("ai", () => ({
  OpenAIStream: vi.fn(() => "mocked-openai-stream"),
  AnthropicStream: vi.fn(() => "mocked-anthropic-stream"),
  StreamingTextResponse: vi.fn((stream) => ({
    stream,
    headers: {
      "Content-Type": "text/event-stream",
    },
  })),
}));

// Mock the fetch function
global.fetch = vi.fn();
global.ReadableStream = vi.fn().mockImplementation(() => ({
  pipeThrough: vi.fn().mockReturnThis(),
  getReader: vi.fn(),
}));
global.TextDecoder = vi.fn().mockImplementation(() => ({
  decode: vi.fn(),
}));

describe("streamChat API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call the appropriate AI service based on the model", async () => {
    // Mock successful fetch response
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({}),
      body: {
        getReader: vi.fn(),
      },
    };
    fetch.mockResolvedValueOnce(mockResponse);

    const apiKey = "test-api-key";
    const model = "claude-3-5-sonnet-20240620";
    const messages = [{ role: "user", content: "Hello world" }];

    const req = {
      json: vi.fn().mockResolvedValue({ messages, model }),
      headers: {
        get: (key) =>
          key.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : null,
      },
    };

    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };

    await streamChat(req, res);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${apiKey}`,
        }),
        body: expect.any(String),
      }),
    );
  });

  it("should return an error if no API key is provided", async () => {
    const model = "claude-3-5-sonnet-20240620";
    const messages = [{ role: "user", content: "Hello world" }];

    const req = {
      json: vi.fn().mockResolvedValue({ messages, model }),
      headers: {
        get: () => null,
      },
    };

    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };

    await streamChat(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("API key"),
      }),
    );
  });

  it("should handle OpenAI models correctly", async () => {
    // Mock successful fetch response
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({}),
      body: {
        getReader: vi.fn(),
      },
    };
    fetch.mockResolvedValueOnce(mockResponse);

    const apiKey = "test-api-key";
    const model = "gpt-4";
    const messages = [{ role: "user", content: "Hello world" }];

    const req = {
      json: vi.fn().mockResolvedValue({ messages, model }),
      headers: {
        get: (key) =>
          key.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : null,
      },
    };

    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };

    await streamChat(req, res);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        }),
        body: expect.any(String),
      }),
    );
  });
});
