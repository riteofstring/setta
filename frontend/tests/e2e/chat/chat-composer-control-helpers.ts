import { expect, type Locator, type Page } from "@playwright/test";
import * as http from "node:http";

export type ManagedAPIKeysSnapshot = {
  apiKeys: Record<string, string>;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

type ManagedOpenAIResponsesProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedOpenAIResponsesProviderServer = {
  origin: string;
  requests: ManagedOpenAIResponsesProviderRequest[];
  close: () => Promise<void>;
};

type ManagedOpenAIChatProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedOpenAIChatProviderServer = {
  origin: string;
  requests: ManagedOpenAIChatProviderRequest[];
  close: () => Promise<void>;
};

type ManagedOpenAIAbortableChatProviderServer = {
  origin: string;
  requests: ManagedOpenAIChatProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

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

type ManagedAnthropicThinkingProviderRequest = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedAnthropicThinkingProviderServer = {
  origin: string;
  requests: ManagedAnthropicThinkingProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAnthropicStandardProviderRequest = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedAnthropicStandardProviderServer = {
  origin: string;
  requests: ManagedAnthropicStandardProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAnthropicAbortableProviderServer = {
  origin: string;
  requests: ManagedAnthropicStandardProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

type ManagedAzureChatProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedAzureChatProviderServer = {
  origin: string;
  requests: ManagedAzureChatProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAzureAbortableChatProviderServer = {
  origin: string;
  requests: ManagedAzureChatProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

export function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}

export async function mountManagedChatAreaForSharePolicy(
  page: Page,
  { allowLLM }: { allowLLM: boolean },
): Promise<Locator> {
  const containerId = `managed-chat-preview-${Date.now()}`;
  await page.evaluate(
    async ({ containerId, allowLLM }) => {
      const { useProjectState, useShareSession } = await import(
        "/src/state/definitions.ts"
      );
      const { resetProjectStores } = await import("/src/state/utils.ts");
      const {
        createChatSectionImpl,
        createCore,
        createProjectConfig,
        createUserDefaultChatSectionImpl,
        createVariant,
      } = await import("/src/utils/generatedTypes.ts");
      const { React, createRoot } = await import(
        "/src/testUtils/appRouteTestUtils.ts"
      );
      const { ChatArea } = await import(
        "/src/components/Section/Layouts/ChatArea.tsx"
      );

      resetProjectStores();
      useShareSession.setState({
        isDeploymentMode: true,
        sharePolicy: {
          allowLLM,
          allowLayoutChanges: false,
          allowParamChanges: false,
          allowVariantChanges: false,
          allowRun: false,
          allowMultipleRuns: false,
        },
        shareSessionId: null,
        sessionRunCount: 0,
        shareDeploymentName: null,
        shareDeploymentVersion: null,
        deploymentMode: null,
      });

      const sectionId = "managed-chat-preview-section";
      const variantId = "managed-chat-preview-variant";
      const implId = "managed-chat-preview-impl";
      useProjectState.setState({
        projectConfig: createProjectConfig({
          id: "managed-chat-preview-project",
          name: "Managed Chat Preview",
          sectionVariantMap: { [sectionId]: variantId },
          topLevelSections: {
            [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
          },
          agenticEdges: [],
        }),
        sections: {
          [sectionId]: createCore({
            id: sectionId,
            name: "Managed Chat Preview",
            variants: [variantId],
            defaultVariant: variantId,
          }),
        },
        sectionVariants: {
          [variantId]: createVariant({
            id: variantId,
            name: "Managed Chat Preview Variant",
            impl: implId,
            nonPresetImpls: [],
          }),
        },
        sectionImpls: {
          [implId]: createChatSectionImpl(
            createUserDefaultChatSectionImpl({
              managed: true,
              chatId: null,
              thinking: false,
            }),
            {
              id: implId,
            },
          ),
        },
        parentSectionMap: { [sectionId]: null },
        previewSectionVariantMap: {},
      });

      const existing = document.getElementById(containerId);
      existing?.remove();
      const container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(React.createElement(ChatArea, { sectionId }));

      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (container.querySelector("textarea")) {
          return;
        }
      }
      throw new Error("Managed chat preview did not render.");
    },
    { containerId, allowLLM },
  );

  return page.locator(`#${containerId}`);
}

export async function selectProjectAiEngine(
  page: Page,
  engineQuery: string,
): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  await projectChatSurface
    .getByRole("button", { name: "Project AI Settings" })
    .click();
  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();
  await engineInput.fill(engineQuery);
  await engineInput.press("Enter");
}

export async function postManagedAPIKeys(
  page: Page,
  payload: {
    apiKeys: Record<string, string>;
    expectedRevision: number;
  },
): Promise<ManagedAPIKeysSnapshot> {
  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const response = await page.request.post(`${backendOrigin}/api/llm/apiKeys`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): /llm/apiKeys${detail}`,
    );
  }
  return JSON.parse(text) as ManagedAPIKeysSnapshot;
}

export async function setCompletionGuardEnabledForTest(
  page: Page,
  enabled: boolean,
): Promise<() => Promise<void>> {
  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const loadResponse = await page.request.post(
    `${backendOrigin}/api/loadSettings`,
    { data: null },
  );
  const loadText = await loadResponse.text();
  if (!loadResponse.ok()) {
    const detail = loadText ? ` ${loadText}` : "";
    throw new Error(
      `Backend request failed (${loadResponse.status()}): /loadSettings${detail}`,
    );
  }
  const initialSettings = JSON.parse(loadText) as Record<string, unknown>;
  const initialBackend =
    initialSettings.backend &&
    typeof initialSettings.backend === "object" &&
    !Array.isArray(initialSettings.backend)
      ? (initialSettings.backend as Record<string, unknown>)
      : {};
  await saveSettingsForTest(page, {
    ...initialSettings,
    backend: {
      ...initialBackend,
      completionGuardEnabled: enabled,
    },
  });
  return async () => {
    await saveSettingsForTest(page, initialSettings);
  };
}

export async function saveSettingsForTest(
  page: Page,
  settings: Record<string, unknown>,
): Promise<void> {
  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const saveResponse = await page.request.post(
    `${backendOrigin}/api/saveSettings`,
    {
      data: { settings },
    },
  );
  const saveText = await saveResponse.text();
  if (!saveResponse.ok()) {
    const detail = saveText ? ` ${saveText}` : "";
    throw new Error(
      `Backend request failed (${saveResponse.status()}): /saveSettings${detail}`,
    );
  }
}

export async function startManagedOpenAIResponsesThinkingServer(): Promise<ManagedOpenAIResponsesProviderServer> {
  const requests: ManagedOpenAIResponsesProviderRequest[] = [];
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
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
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
          'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"type":"reasoning","id":"reasoning-1","summary":[],"content":[],"status":"in_progress"}}\n\n',
        );
        response.write(
          'data: {"type":"response.reasoning_summary_text.delta","sequence_number":2,"item_id":"reasoning-1","output_index":0,"summary_index":0,"delta":"Plan summary"}\n\n',
        );
        response.write(
          'data: {"type":"response.reasoning_text.delta","sequence_number":3,"item_id":"reasoning-1","output_index":0,"content_index":0,"delta":"Planning deeply"}\n\n',
        );
        response.write(
          'data: {"type":"response.output_text.delta","sequence_number":4,"item_id":"message-1","output_index":1,"content_index":0,"delta":"Final answer","logprobs":[]}\n\n',
        );
        response.end(
          'data: {"type":"response.completed","sequence_number":99,"response":{"id":"response-1","object":"response","created_at":1741567200,"status":"completed","model":"gpt-5-codex","output":[{"type":"reasoning","id":"reasoning-1","summary":[{"text":"Plan summary"}],"content":[{"type":"reasoning_text","text":"Planning deeply"}],"status":"completed"},{"type":"message","id":"message-1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Final answer","annotations":[]}]}],"usage":{"input_tokens":8,"input_tokens_details":{"cached_tokens":0},"output_tokens":3,"output_tokens_details":{"reasoning_tokens":2},"total_tokens":11}}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI thinking test port.")),
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

export async function startManagedOpenAIChatServer(): Promise<ManagedOpenAIChatProviderServer> {
  const requests: ManagedOpenAIChatProviderRequest[] = [];
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
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
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
          'data: {"choices":[{"index":0,"delta":{"content":"OpenAI"}}]}\n\n',
        );
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":" standard answer"},"finish_reason":"stop"}]}\n\n',
        );
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":18,"completion_tokens":3,"total_tokens":21}}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI standard test port.")),
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

export async function startManagedOpenAIAbortableChatServer(): Promise<ManagedOpenAIAbortableChatProviderServer> {
  const requests: ManagedOpenAIChatProviderRequest[] = [];
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
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
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
          'data: {"choices":[{"index":0,"delta":{"content":"Streaming"}}]}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI abortable test port.")),
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

export async function startManagedOpenAIChatToolCallServer(): Promise<ManagedOpenAIChatProviderServer> {
  const requests: ManagedOpenAIChatProviderRequest[] = [];
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
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
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
            'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"tool-call-1","type":"function","function":{"name":"setta__report_completion_status","arguments":"{\\"completionIntent\\":false,\\"requiresVerification\\":false}"}}]},"finish_reason":"tool_calls"}]}\n\n',
          );
          response.end("data: [DONE]\n\n");
          requestCount += 1;
          return;
        }
        if (requestCount === 1) {
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":"Tool-backed"},"finish_reason":null}]}\n\n',
          );
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":" reply"},"finish_reason":"stop"}]}\n\n',
          );
          response.write(
            'data: {"choices":[],"usage":{"prompt_tokens":24,"completion_tokens":2,"total_tokens":26}}\n\n',
          );
          response.end("data: [DONE]\n\n");
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
          reject(new Error("Unable to allocate OpenAI tool-call test port.")),
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

export async function startManagedAnthropicThinkingServer(): Promise<ManagedAnthropicThinkingProviderServer> {
  const requests: ManagedAnthropicThinkingProviderRequest[] = [];
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
        response.write(
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-thinking","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":12,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"Planning"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" deeply"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-thinking"}}\n\n',
        );
        response.write(
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Anthropic answer"}}\n\n',
        );
        response.write(
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
        );
        response.write(
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":12,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
        );
        response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Anthropic thinking test port.")),
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

export async function startManagedAnthropicStandardServer(): Promise<ManagedAnthropicStandardProviderServer> {
  const requests: ManagedAnthropicStandardProviderRequest[] = [];
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
        response.write(
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-standard","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":19,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Anthropic"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" standard answer"}}\n\n',
        );
        response.write(
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        );
        response.write(
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":19,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
        );
        response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Anthropic standard test port.")),
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

export async function startManagedAnthropicAbortableServer(): Promise<ManagedAnthropicAbortableProviderServer> {
  const requests: ManagedAnthropicStandardProviderRequest[] = [];
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
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-stop","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-stop","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":12,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming"}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(
            new Error("Unable to allocate Anthropic abortable test port."),
          ),
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

export async function startManagedAzureOpenAIChatServer(): Promise<ManagedAzureChatProviderServer> {
  const requests: ManagedAzureChatProviderRequest[] = [];
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
            apiKey: Array.isArray(request.headers["api-key"])
              ? request.headers["api-key"].join(", ")
              : request.headers["api-key"] ?? "",
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
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
          'data: {"choices":[{"index":0,"delta":{"content":"Azure"}}]}\n\n',
        );
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":" reply"},"finish_reason":"stop"}]}\n\n',
        );
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":17,"completion_tokens":2,"total_tokens":19}}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Azure thinking test port.")),
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

export async function startManagedAzureOpenAIAbortableServer(): Promise<ManagedAzureAbortableChatProviderServer> {
  const requests: ManagedAzureChatProviderRequest[] = [];
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
            apiKey: Array.isArray(request.headers["api-key"])
              ? request.headers["api-key"].join(", ")
              : request.headers["api-key"] ?? "",
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
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
          'data: {"choices":[{"index":0,"delta":{"content":"Streaming"}}]}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Azure abortable test port.")),
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

export async function getVisibleProjectChatSurface(
  page: Page,
): Promise<Locator> {
  await collapseSidePanesForWindowInteraction(page);
  const surfaceCandidates = [
    page.getByTestId("project-chat-maximized-window").first(),
    page.getByTestId("project-chat-floating-window").first(),
    page.getByTestId("project-chat-bottom-dock-window-panel").first(),
    page
      .locator('#OverviewPane [data-chat-surface-mode="project_ai_mode"]')
      .first(),
  ];
  await expect
    .poll(async () => {
      for (const candidate of surfaceCandidates) {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  for (const candidate of surfaceCandidates) {
    if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
      return candidate;
    }
  }
  throw new Error("No visible project chat surface found.");
}

export async function collapseSidePanesForWindowInteraction(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewVis: false,
      uiEditorVis: false,
    });
  });
}

export async function expectButtonsStackedVertically(
  buttons: Locator[],
): Promise<void> {
  if (buttons.length < 2) {
    throw new Error("Need at least two buttons to verify vertical stacking.");
  }
  const boxes = await Promise.all(
    buttons.map(async (button) => {
      const box = await button.boundingBox();
      if (!box) {
        throw new Error("Missing quick-action button geometry.");
      }
      return box;
    }),
  );
  let previousBottom = boxes[0].y + boxes[0].height;
  const firstCenterX = boxes[0].x + boxes[0].width / 2;
  for (let index = 1; index < boxes.length; index += 1) {
    const box = boxes[index];
    const centerX = box.x + box.width / 2;
    expect(centerX).toBeGreaterThan(firstCenterX - 2);
    expect(centerX).toBeLessThan(firstCenterX + 2);
    expect(box.y).toBeGreaterThan(previousBottom - 1);
    previousBottom = box.y + box.height;
  }
}

export async function setProjectChatSurfaceWidth(
  page: Page,
  widthPx: number,
): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const didSet = await projectChatSurface.evaluate((surface, width) => {
    const panel =
      surface.closest(
        '[data-testid="project-chat-bottom-dock-window-panel"], [data-testid="project-chat-floating-window"], [data-testid="project-chat-maximized-window"]',
      ) ?? surface;
    if (!(panel instanceof HTMLElement)) {
      return false;
    }
    const widthValue = `${width}px`;
    panel.style.width = widthValue;
    panel.style.minWidth = widthValue;
    panel.style.maxWidth = widthValue;
    panel.style.flexBasis = widthValue;
    return true;
  }, widthPx);
  expect(didSet).toBe(true);
}
