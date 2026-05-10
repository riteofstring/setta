import * as http from "node:http";

import type {
  ManagedAnthropicStandardProviderRequest,
  ManagedAnthropicStandardProviderServer,
} from "./chat-composer-control-helpers";

type ManagedGeminiThinkingProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedGeminiThinkingProviderServer = {
  origin: string;
  requests: ManagedGeminiThinkingProviderRequest[];
  close: () => Promise<void>;
};

type ManagedGeminiStandardProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedGeminiStandardProviderServer = {
  origin: string;
  requests: ManagedGeminiStandardProviderRequest[];
  close: () => Promise<void>;
};

type ManagedGeminiAbortableProviderServer = {
  origin: string;
  requests: ManagedGeminiStandardProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

export async function startManagedAnthropicToolCallServer(): Promise<ManagedAnthropicStandardProviderServer> {
  const requests: ManagedAnthropicStandardProviderRequest[] = [];
  let requestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            apiKey: Array.isArray(request.headers["x-api-key"])
              ? request.headers["x-api-key"].join(", ")
              : request.headers["x-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        if (requestCount === 0) {
          response.write(
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-tool-1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":18,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
          );
          response.write(
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-call-1","name":"setta__report_completion_status","input":{}}}\n\n',
          );
          response.write(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"completionIntent\\":false,\\"requiresVerification\\":false}"}}\n\n',
          );
          response.write(
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
          );
          response.write(
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"input_tokens":18,"output_tokens":4,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
          );
          response.end(
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
          );
          requestCount += 1;
          return;
        }
        if (requestCount === 1) {
          response.write(
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-tool-2","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-2","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":23,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
          );
          response.write(
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          );
          response.write(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Tool-backed anthropic reply"}}\n\n',
          );
          response.write(
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
          );
          response.write(
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":23,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
          );
          response.end(
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
          );
          requestCount += 1;
          return;
        }
        response.statusCode = 500;
        response.end("unexpected provider request");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(
            new Error("Unable to allocate Anthropic tool-call test port."),
          ),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

export async function startManagedGeminiStandardServer(): Promise<ManagedGeminiStandardProviderServer> {
  const requests: ManagedGeminiStandardProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Gemini"}]}}]}\n\n',
        );
        response.end(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":" standard answer"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":2,"totalTokenCount":20}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini standard test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

export async function startManagedGeminiAbortableServer(): Promise<ManagedGeminiAbortableProviderServer> {
  const requests: ManagedGeminiStandardProviderRequest[] = [];
  let abortedRequestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        let aborted = false;
        const markAborted = () => {
          if (aborted) {
            return;
          }
          aborted = true;
          abortedRequestCount += 1;
        };

        request.once("aborted", markAborted);
        response.once("close", () => {
          if (!response.writableEnded) {
            markAborted();
          }
        });

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Streaming"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":1,"totalTokenCount":19}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini abortable test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        get abortedRequestCount() {
          return abortedRequestCount;
        },
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

export async function startManagedGeminiToolCallServer(): Promise<ManagedGeminiStandardProviderServer> {
  const requests: ManagedGeminiStandardProviderRequest[] = [];
  let requestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        if (requestCount === 0) {
          response.end(
            'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"id":"tool-call-1","name":"setta__report_completion_status","args":{"completionIntent":false,"requiresVerification":false}}}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":4,"totalTokenCount":22}}\n\n',
          );
          requestCount += 1;
          return;
        }
        if (requestCount === 1) {
          response.end(
            'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Tool-backed gemini reply"}]}}],"usageMetadata":{"promptTokenCount":23,"candidatesTokenCount":3,"totalTokenCount":26}}\n\n',
          );
          requestCount += 1;
          return;
        }
        response.statusCode = 500;
        response.end("unexpected provider request");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini tool-call test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

export async function startManagedGeminiThinkingServer(): Promise<ManagedGeminiThinkingProviderServer> {
  const requests: ManagedGeminiThinkingProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            query: new URL(
              request.url ?? "/",
              "http://127.0.0.1",
            ).searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Planning","thought":true,"thoughtSignature":"c2ln"}]}}]}\n\n',
        );
        response.end(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Gemini answer"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":3,"totalTokenCount":21,"thoughtsTokenCount":2}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini thinking test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}
