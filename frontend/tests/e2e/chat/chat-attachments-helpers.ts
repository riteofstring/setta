import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import * as http from "node:http";
import path from "path";
import { fileURLToPath } from "url";

export const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export type EngineConfig = {
  id: string;
  name: string;
  engineType: string;
  settaLlmConfigId?: string | null;
};

export type LLMConfigEntry = {
  model: string;
  provider?: string | null;
  api_key_env?: string | null;
  base_url?: string | null;
  other_params?: Record<string, unknown> | null;
  mcpServerIds?: string[] | null;
  temporary?: boolean;
};

export type LLMConfigPayload = {
  configs: Record<string, LLMConfigEntry>;
  mcpServers: Record<string, unknown>;
  defaultMcpServerIds?: string[];
  default_config_id?: string | null;
  codexMcpImportedAt?: string | null;
};

export type ManagedAPIKeysSnapshot = {
  apiKeys: Record<string, string>;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

export type CreateSectionResponse = {
  sectionId?: string;
};

export type ProjectMetadataEntry = { id: string; name: string };
export type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
export type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

export type ManagedChatProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

export type ManagedChatProviderServer = {
  origin: string;
  requests: ManagedChatProviderRequest[];
  close: () => Promise<void>;
};

export type ManagedAnthropicProviderRequest = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
};

export type ManagedAnthropicProviderServer = {
  origin: string;
  requests: ManagedAnthropicProviderRequest[];
  close: () => Promise<void>;
};

export type ManagedGeminiProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  body: Record<string, unknown>;
};

export type ManagedGeminiProviderServer = {
  origin: string;
  requests: ManagedGeminiProviderRequest[];
  close: () => Promise<void>;
};

export type ManagedAzureProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  authorization: string;
  body: Record<string, unknown>;
};

export type ManagedAzureProviderServer = {
  origin: string;
  requests: ManagedAzureProviderRequest[];
  close: () => Promise<void>;
};

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const ATTACHMENT_FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "fixtures",
  "attachments",
);

export async function setOverviewTab(
  page: Page,
  tabName: string,
): Promise<void> {
  await page.addInitScript((tab) => {
    const key = "setta_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          payload = {
            state:
              typeof parsed.state === "object" && parsed.state
                ? parsed.state
                : {},
            version: typeof parsed.version === "number" ? parsed.version : 0,
          };
        }
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, overviewTab: tab, overviewVis: true };
    localStorage.setItem(key, JSON.stringify(payload));
  }, tabName);
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
  const existingSurface =
    await findVisibleProjectChatSurfaceCandidate(surfaceCandidates);
  if (existingSurface) {
    return existingSurface;
  }
  const createChatWindowButton = page
    .getByRole("button", { name: "Create chat window" })
    .first();
  if (
    (await createChatWindowButton.count()) > 0 &&
    (await createChatWindowButton.isVisible())
  ) {
    await createChatWindowButton.click();
  }
  await expect
    .poll(async () => {
      return Boolean(
        await findVisibleProjectChatSurfaceCandidate(surfaceCandidates),
      );
    })
    .toBe(true);
  const visibleSurface =
    await findVisibleProjectChatSurfaceCandidate(surfaceCandidates);
  if (visibleSurface) {
    return visibleSurface;
  }
  throw new Error("No visible project chat surface found.");
}

async function findVisibleProjectChatSurfaceCandidate(
  candidates: Locator[],
): Promise<Locator | null> {
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
      return candidate;
    }
  }
  return null;
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
  await expect(engineInput).toHaveValue(engineQuery);
}

export async function syncManagedAIFrontendState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } = await import(
      "/src/state/actions/ai.ts"
    );
    await loadLLMConfig();
    await loadLLMApiKeys();
    await loadEngineConfigs(true);
  });
}

export async function postBackend<T>(
  request: APIRequestContext,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}

export async function getBackend<T>(
  request: APIRequestContext,
  path: string,
): Promise<T | null> {
  const response = await request.get(`${BACKEND_ORIGIN}/api${path}`);
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}

export async function postManagedAPIKeys(
  request: APIRequestContext,
  payload: {
    apiKeys: Record<string, string>;
    expectedRevision: number;
  },
): Promise<ManagedAPIKeysSnapshot> {
  const response = await request.post(`${BACKEND_ORIGIN}/api/llm/apiKeys`, {
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

export function providerRequestsForPath<T extends { path: string }>(
  requests: T[],
  path: string,
): T[] {
  return requests.filter((request) => request.path === path);
}

export async function startManagedChatProviderServer(): Promise<ManagedChatProviderServer> {
  const requests: ManagedChatProviderRequest[] = [];
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
          'data: {"choices":[{"index":0,"delta":{"content":"Go owned"}}]}\n\n',
        );
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":" attachment reply"},"finish_reason":"stop"}]}\n\n',
        );
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":34,"completion_tokens":3,"total_tokens":37}}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate managed provider test port.")),
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

export async function startManagedAnthropicAttachmentProviderServer(): Promise<ManagedAnthropicProviderServer> {
  const requests: ManagedAnthropicProviderRequest[] = [];
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
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-attachment-anthropic","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":19,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Anthropic"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" attachment reply"}}\n\n',
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
          reject(
            new Error("Unable to allocate Anthropic attachment test port."),
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

export async function startManagedGeminiAttachmentProviderServer(): Promise<ManagedGeminiProviderServer> {
  const requests: ManagedGeminiProviderRequest[] = [];
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
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":" attachment reply"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":2,"totalTokenCount":20}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini attachment test port.")),
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

export async function startManagedAzureAttachmentProviderServer(): Promise<ManagedAzureProviderServer> {
  const requests: ManagedAzureProviderRequest[] = [];
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
          'data: {"choices":[{"index":0,"delta":{"content":" attachment reply"},"finish_reason":"stop"}]}\n\n',
        );
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":34,"completion_tokens":3,"total_tokens":37}}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Azure attachment test port.")),
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

export async function getCurrentProjectConfigId(
  page: Page,
  request: APIRequestContext,
): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    request,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
}

export async function openIsolatedProject(
  page: Page,
  request: APIRequestContext,
): Promise<IsolatedProjectContext> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    request,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const name = await postBackend<string>(request, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (!name) {
    throw new Error("Missing project config name.");
  }
  const url = new URL(name, BASE_URL).toString();
  await page.goto(url);
  await page.waitForSelector(".react-flow__pane");
  const projectConfigId = await getCurrentProjectConfigId(page, request);
  return {
    projectConfigId,
    defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
  };
}

export async function cleanupIsolatedProject(
  request: APIRequestContext,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  if (
    context.defaultProjectConfigId &&
    context.defaultProjectConfigId !== context.projectConfigId
  ) {
    await postBackend(request, "/setAsDefaultProject", {
      projectConfigId: context.defaultProjectConfigId,
    });
  }
  await postBackend(request, "/deleteProjectConfigs", {
    ids: [context.projectConfigId],
  });
}

export async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p')
    .allTextContents();
  const existingTitles = new Set(
    titles.map((title) => title.trim()).filter(Boolean),
  );
  if (!existingTitles.has(baseName)) {
    return baseName;
  }
  for (let i = 1; i <= 5; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!existingTitles.has(candidate)) {
      return candidate;
    }
  }
  return `${baseName}-${Date.now()}`;
}

export function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

export async function ensureChatSection(
  page: Page,
  request: APIRequestContext,
  baseName: string,
): Promise<Locator> {
  const projectConfigId = await getCurrentProjectConfigId(page, request);
  const sectionName = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    request,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  await postBackend(request, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  const section = findSectionCandidates(page, sectionName).first();
  await expect(section).toBeVisible();
  return section;
}

export async function dropFiles(
  target: Locator,
  files: Array<{ name: string; mimeType: string; data: string }>,
): Promise<void> {
  const page = target.page();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  for (const file of files) {
    await dataTransfer.evaluate((dt, payload) => {
      const binary = atob(payload.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: payload.mimeType });
      const fileObj = new File([blob], payload.name, {
        type: payload.mimeType,
      });
      dt.items.add(fileObj);
    }, file);
  }
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}
