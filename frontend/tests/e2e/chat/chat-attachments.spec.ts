import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import * as http from "node:http";
import path from "path";
import { fileURLToPath } from "url";
import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

type EngineConfig = {
  id: string;
  name: string;
  engineType: string;
  settaLlmConfigId?: string | null;
};

type LLMConfigEntry = {
  model: string;
  provider?: string | null;
  api_key_env?: string | null;
  base_url?: string | null;
  other_params?: Record<string, unknown> | null;
  mcpServerIds?: string[] | null;
  temporary?: boolean;
};

type LLMConfigPayload = {
  configs: Record<string, LLMConfigEntry>;
  mcpServers: Record<string, unknown>;
  defaultMcpServerIds?: string[];
  default_config_id?: string | null;
  codexMcpImportedAt?: string | null;
};

type ManagedAPIKeysSnapshot = {
  apiKeys: Record<string, string>;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

type CreateSectionResponse = {
  sectionId?: string;
};

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

type ManagedChatProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedChatProviderServer = {
  origin: string;
  requests: ManagedChatProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAnthropicProviderRequest = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedAnthropicProviderServer = {
  origin: string;
  requests: ManagedAnthropicProviderRequest[];
  close: () => Promise<void>;
};

type ManagedGeminiProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedGeminiProviderServer = {
  origin: string;
  requests: ManagedGeminiProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAzureProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedAzureProviderServer = {
  origin: string;
  requests: ManagedAzureProviderRequest[];
  close: () => Promise<void>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATTACHMENT_FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "fixtures",
  "attachments",
);

test.describe.serial("chat attachments", () => {
  test("project chat attachments via picker", async ({ page }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);
    const initialLLMConfig = await getBackend<LLMConfigPayload>(
      page.request,
      "/llm/config",
    );
    if (!initialLLMConfig) {
      throw new Error("Missing LLM config payload.");
    }
    const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
      page.request,
      "/llm/apiKeys",
    );
    if (!initialAPIKeysSnapshot) {
      throw new Error("Missing managed API keys snapshot.");
    }
    const providerServer = await startManagedChatProviderServer();
    let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
    let createdEngineConfigId: string | null = null;
    const llmConfigId = `e2e-project-chat-attachments-${Date.now()}`;
    const engineName = `Project Attachment Engine ${Date.now()}`;

    try {
      await postBackend(page.request, "/llm/config", {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [llmConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: `${providerServer.origin}/v1`,
            other_params: null,
            temporary: false,
          },
        },
      } as Record<string, unknown>);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page.request, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          OPENAI_API_KEY: "e2e-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });
      const createdEngine = await postBackend<EngineConfig>(
        page.request,
        "/createEngineConfig",
        {
          name: engineName,
          engineType: "setta_llm",
          settaLlmConfigId: llmConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing managed engine config id.");
      }

      await syncManagedAIFrontendState(page);

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, engineName);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      const fileInput = projectChatSurface
        .locator('input[type="file"]')
        .first();
      await fileInput.setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Hello from project chat."),
      });

      await expect(projectChatSurface.getByText("notes.txt")).toBeVisible();

      await input.fill("Here is a file.");
      await input.press("Enter");

      await expect.poll(() => providerServer.requests.length).toBe(1);
      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/chat/completions");
      expect(providerRequest?.authorization).toBe("Bearer e2e-secret");
      const providerMessages = providerRequest?.body.messages;
      expect(Array.isArray(providerMessages)).toBe(true);
      const userMessage =
        Array.isArray(providerMessages) && providerMessages.length > 1
          ? (providerMessages[1] as Record<string, unknown>)
          : null;
      expect(userMessage).not.toBeNull();
      expect("attachments" in (userMessage ?? {})).toBe(false);
      const providerContent =
        typeof userMessage?.content === "string" ? userMessage.content : "";
      expect(providerContent).toContain("Here is a file.");
      expect(providerContent).toContain("[Attachment: notes.txt]");
      expect(providerContent).toContain("Hello from project chat.");

      await expect(
        projectChatSurface.getByText("Go owned attachment reply"),
      ).toBeVisible();

      const attachmentButton = projectChatSurface
        .getByRole("button", { name: "notes.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText(
        "Hello from project chat.",
      );
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      if (createdEngineConfigId) {
        await postBackend(page.request, "/deleteEngineConfig", {
          configId: createdEngineConfigId,
        });
      }
      await postBackend(
        page.request,
        "/llm/config",
        initialLLMConfig as Record<string, unknown>,
      );
      await postManagedAPIKeys(page.request, {
        apiKeys: initialAPIKeysSnapshot.apiKeys,
        expectedRevision: latestAPIKeysSnapshot.revision,
      });
      await providerServer.close();
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("project chat non-text attachments fall back to explicit provider text", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);
    const initialLLMConfig = await getBackend<LLMConfigPayload>(
      page.request,
      "/llm/config",
    );
    if (!initialLLMConfig) {
      throw new Error("Missing LLM config payload.");
    }
    const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
      page.request,
      "/llm/apiKeys",
    );
    if (!initialAPIKeysSnapshot) {
      throw new Error("Missing managed API keys snapshot.");
    }
    const providerServer = await startManagedChatProviderServer();
    let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
    let createdEngineConfigId: string | null = null;
    const llmConfigId = `e2e-project-chat-image-attachments-${Date.now()}`;
    const engineName = `Project Image Attachment Engine ${Date.now()}`;

    try {
      await postBackend(page.request, "/llm/config", {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [llmConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: `${providerServer.origin}/v1`,
            other_params: null,
            temporary: false,
          },
        },
      } as Record<string, unknown>);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page.request, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          OPENAI_API_KEY: "e2e-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });
      const createdEngine = await postBackend<EngineConfig>(
        page.request,
        "/createEngineConfig",
        {
          name: engineName,
          engineType: "setta_llm",
          settaLlmConfigId: llmConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing managed engine config id.");
      }

      await syncManagedAIFrontendState(page);

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, engineName);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      const fileInput = projectChatSurface
        .locator('input[type="file"]')
        .first();
      await fileInput.setInputFiles({
        name: "image.png",
        mimeType: "image/png",
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      });

      await expect(projectChatSurface.getByText("image.png")).toBeVisible();

      await input.fill("Use this image attachment.");
      await input.press("Enter");

      await expect.poll(() => providerServer.requests.length).toBe(1);
      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/chat/completions");
      expect(providerRequest?.authorization).toBe("Bearer e2e-secret");
      const providerMessages = providerRequest?.body.messages;
      expect(Array.isArray(providerMessages)).toBe(true);
      const userMessage =
        Array.isArray(providerMessages) && providerMessages.length > 1
          ? (providerMessages[1] as Record<string, unknown>)
          : null;
      expect(userMessage).not.toBeNull();
      expect("attachments" in (userMessage ?? {})).toBe(false);
      const providerContent =
        typeof userMessage?.content === "string" ? userMessage.content : "";
      expect(providerContent).toContain("Use this image attachment.");
      expect(providerContent).toContain("[Attachment: image.png]");
      expect(providerContent).toContain("Type: image/png");
      expect(providerContent).toContain("Content not inlined.");

      await expect(
        projectChatSurface.getByText("Go owned attachment reply"),
      ).toBeVisible();
    } finally {
      if (createdEngineConfigId) {
        await postBackend(page.request, "/deleteEngineConfig", {
          configId: createdEngineConfigId,
        });
      }
      await postBackend(
        page.request,
        "/llm/config",
        initialLLMConfig as Record<string, unknown>,
      );
      await postManagedAPIKeys(page.request, {
        apiKeys: initialAPIKeysSnapshot.apiKeys,
        expectedRevision: latestAPIKeysSnapshot.revision,
      });
      await providerServer.close();
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("project chat attachments reach Anthropic with explicit attachment text", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);
    const initialLLMConfig = await getBackend<LLMConfigPayload>(
      page.request,
      "/llm/config",
    );
    if (!initialLLMConfig) {
      throw new Error("Missing LLM config payload.");
    }
    const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
      page.request,
      "/llm/apiKeys",
    );
    if (!initialAPIKeysSnapshot) {
      throw new Error("Missing managed API keys snapshot.");
    }
    const providerServer = await startManagedAnthropicAttachmentProviderServer();
    let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
    let createdEngineConfigId: string | null = null;
    const llmConfigId = `e2e-project-chat-anthropic-attachments-${Date.now()}`;
    const engineName = `Project Anthropic Attachment Engine ${Date.now()}`;

    try {
      await postBackend(page.request, "/llm/config", {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [llmConfigId]: {
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: providerServer.origin,
            other_params: null,
            temporary: false,
          },
        },
      } as Record<string, unknown>);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page.request, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          ANTHROPIC_API_KEY: "e2e-anthropic-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });
      const createdEngine = await postBackend<EngineConfig>(
        page.request,
        "/createEngineConfig",
        {
          name: engineName,
          engineType: "setta_llm",
          settaLlmConfigId: llmConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing managed engine config id.");
      }

      await syncManagedAIFrontendState(page);

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, engineName);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      const fileInput = projectChatSurface
        .locator('input[type="file"]')
        .first();
      await fileInput.setInputFiles([
        {
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Hello from project chat."),
        },
        {
          name: "image.png",
          mimeType: "image/png",
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ]);

      await expect(projectChatSurface.getByText("notes.txt")).toBeVisible();
      await expect(projectChatSurface.getByText("image.png")).toBeVisible();

      await input.fill("Here are Anthropic attachments.");
      await input.press("Enter");

      await expect.poll(() => providerServer.requests.length).toBe(1);
      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/messages");
      expect(providerRequest?.apiKey).toBe("e2e-anthropic-secret");
      const providerMessagesJSON = JSON.stringify(
        providerRequest?.body.messages ?? null,
      );
      expect(providerMessagesJSON).not.toContain('"attachments"');
      expect(providerMessagesJSON).toContain("Here are Anthropic attachments.");
      expect(providerMessagesJSON).toContain("[Attachment: notes.txt]");
      expect(providerMessagesJSON).toContain("Hello from project chat.");
      expect(providerMessagesJSON).toContain("[Attachment: image.png]");
      expect(providerMessagesJSON).toContain("Type: image/png");
      expect(providerMessagesJSON).toContain("Content not inlined.");

      await expect(
        projectChatSurface.getByText("Anthropic attachment reply"),
      ).toBeVisible();

      const attachmentButton = projectChatSurface
        .getByRole("button", { name: "notes.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText(
        "Hello from project chat.",
      );
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      if (createdEngineConfigId) {
        await postBackend(page.request, "/deleteEngineConfig", {
          configId: createdEngineConfigId,
        });
      }
      await postBackend(
        page.request,
        "/llm/config",
        initialLLMConfig as Record<string, unknown>,
      );
      await postManagedAPIKeys(page.request, {
        apiKeys: initialAPIKeysSnapshot.apiKeys,
        expectedRevision: latestAPIKeysSnapshot.revision,
      });
      await providerServer.close();
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("project chat attachments reach Gemini with explicit attachment text", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);
    const initialLLMConfig = await getBackend<LLMConfigPayload>(
      page.request,
      "/llm/config",
    );
    if (!initialLLMConfig) {
      throw new Error("Missing LLM config payload.");
    }
    const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
      page.request,
      "/llm/apiKeys",
    );
    if (!initialAPIKeysSnapshot) {
      throw new Error("Missing managed API keys snapshot.");
    }
    const providerServer = await startManagedGeminiAttachmentProviderServer();
    let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
    let createdEngineConfigId: string | null = null;
    const llmConfigId = `e2e-project-chat-gemini-attachments-${Date.now()}`;
    const engineName = `Project Gemini Attachment Engine ${Date.now()}`;

    try {
      await postBackend(page.request, "/llm/config", {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [llmConfigId]: {
            model: "gemini-2.5-pro",
            provider: "gemini",
            api_key_env: "GEMINI_API_KEY",
            base_url: providerServer.origin,
            other_params: null,
            temporary: false,
          },
        },
      } as Record<string, unknown>);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page.request, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          GEMINI_API_KEY: "e2e-gemini-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });
      const createdEngine = await postBackend<EngineConfig>(
        page.request,
        "/createEngineConfig",
        {
          name: engineName,
          engineType: "setta_llm",
          settaLlmConfigId: llmConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing managed engine config id.");
      }

      await syncManagedAIFrontendState(page);

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, engineName);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      const fileInput = projectChatSurface
        .locator('input[type="file"]')
        .first();
      await fileInput.setInputFiles([
        {
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Hello from project chat."),
        },
        {
          name: "image.png",
          mimeType: "image/png",
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ]);

      await expect(projectChatSurface.getByText("notes.txt")).toBeVisible();
      await expect(projectChatSurface.getByText("image.png")).toBeVisible();

      await input.fill("Here are Gemini attachments.");
      await input.press("Enter");

      await expect.poll(() => providerServer.requests.length).toBe(1);
      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe(
        "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
      );
      expect(providerRequest?.query).toBe("alt=sse");
      expect(providerRequest?.apiKey).toBe("e2e-gemini-secret");

      const contents = providerRequest?.body.contents;
      expect(Array.isArray(contents)).toBe(true);
      const userContent =
        Array.isArray(contents) && contents.length > 0
          ? (contents[0] as Record<string, unknown>)
          : null;
      expect(userContent).not.toBeNull();
      const parts =
        Array.isArray(userContent?.parts) && userContent.parts.length > 0
          ? (userContent.parts as Array<Record<string, unknown>>)
          : [];
      expect(parts.length).toBeGreaterThan(0);
      const providerText = parts
        .map((part) => String(part.text ?? "").trim())
        .join("\n");
      expect(providerText).toContain("Here are Gemini attachments.");
      expect(providerText).toContain("[Attachment: notes.txt]");
      expect(providerText).toContain("Hello from project chat.");
      expect(providerText).toContain("[Attachment: image.png]");
      expect(providerText).toContain("Type: image/png");
      expect(providerText).toContain("Content not inlined.");

      await expect(
        projectChatSurface.getByText("Gemini attachment reply"),
      ).toBeVisible();

      const attachmentButton = projectChatSurface
        .getByRole("button", { name: "notes.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText(
        "Hello from project chat.",
      );
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      if (createdEngineConfigId) {
        await postBackend(page.request, "/deleteEngineConfig", {
          configId: createdEngineConfigId,
        });
      }
      await postBackend(
        page.request,
        "/llm/config",
        initialLLMConfig as Record<string, unknown>,
      );
      await postManagedAPIKeys(page.request, {
        apiKeys: initialAPIKeysSnapshot.apiKeys,
        expectedRevision: latestAPIKeysSnapshot.revision,
      });
      await providerServer.close();
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("project chat attachments reach Azure OpenAI with explicit attachment text", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);
    const initialLLMConfig = await getBackend<LLMConfigPayload>(
      page.request,
      "/llm/config",
    );
    if (!initialLLMConfig) {
      throw new Error("Missing LLM config payload.");
    }
    const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
      page.request,
      "/llm/apiKeys",
    );
    if (!initialAPIKeysSnapshot) {
      throw new Error("Missing managed API keys snapshot.");
    }
    const providerServer = await startManagedAzureAttachmentProviderServer();
    let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
    let createdEngineConfigId: string | null = null;
    const llmConfigId = `e2e-project-chat-azure-attachments-${Date.now()}`;
    const engineName = `Project Azure Attachment Engine ${Date.now()}`;

    try {
      await postBackend(page.request, "/llm/config", {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [llmConfigId]: {
            model: "gpt-4o-mini",
            provider: "azure",
            api_key_env: "AZURE_OPENAI_API_KEY",
            base_url: providerServer.origin,
            other_params: {
              api_version: "2024-06-01",
            },
            temporary: false,
          },
        },
      } as Record<string, unknown>);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page.request, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          AZURE_OPENAI_API_KEY: "e2e-azure-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });
      const createdEngine = await postBackend<EngineConfig>(
        page.request,
        "/createEngineConfig",
        {
          name: engineName,
          engineType: "setta_llm",
          settaLlmConfigId: llmConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing managed engine config id.");
      }

      await syncManagedAIFrontendState(page);

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, engineName);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      const fileInput = projectChatSurface
        .locator('input[type="file"]')
        .first();
      await fileInput.setInputFiles([
        {
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Hello from project chat."),
        },
        {
          name: "image.png",
          mimeType: "image/png",
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ]);

      await expect(projectChatSurface.getByText("notes.txt")).toBeVisible();
      await expect(projectChatSurface.getByText("image.png")).toBeVisible();

      await input.fill("Here are Azure attachments.");
      await input.press("Enter");

      await expect.poll(() => providerServer.requests.length).toBe(1);
      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe(
        "/openai/deployments/gpt-4o-mini/chat/completions",
      );
      expect(providerRequest?.query).toBe("api-version=2024-06-01");
      expect(providerRequest?.apiKey).toBe("e2e-azure-secret");
      expect(providerRequest?.authorization).toBe("");

      const providerMessages = providerRequest?.body.messages;
      expect(Array.isArray(providerMessages)).toBe(true);
      const userMessage =
        Array.isArray(providerMessages) && providerMessages.length > 1
          ? (providerMessages[1] as Record<string, unknown>)
          : null;
      expect(userMessage).not.toBeNull();
      expect("attachments" in (userMessage ?? {})).toBe(false);
      const providerContent =
        typeof userMessage?.content === "string" ? userMessage.content : "";
      expect(providerContent).toContain("Here are Azure attachments.");
      expect(providerContent).toContain("[Attachment: notes.txt]");
      expect(providerContent).toContain("Hello from project chat.");
      expect(providerContent).toContain("[Attachment: image.png]");
      expect(providerContent).toContain("Type: image/png");
      expect(providerContent).toContain("Content not inlined.");

      await expect(
        projectChatSurface.getByText("Azure attachment reply"),
      ).toBeVisible();

      const attachmentButton = projectChatSurface
        .getByRole("button", { name: "notes.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText(
        "Hello from project chat.",
      );
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      if (createdEngineConfigId) {
        await postBackend(page.request, "/deleteEngineConfig", {
          configId: createdEngineConfigId,
        });
      }
      await postBackend(
        page.request,
        "/llm/config",
        initialLLMConfig as Record<string, unknown>,
      );
      await postManagedAPIKeys(page.request, {
        apiKeys: initialAPIKeysSnapshot.apiKeys,
        expectedRevision: latestAPIKeysSnapshot.revision,
      });
      await providerServer.close();
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("chat section drag-and-drop attachments", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);

    try {
      const chatSection = await ensureChatSection(
        page,
        page.request,
        "__pw_chat_drop__",
      );
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const dropTarget = input.locator("..");
      await dropFiles(dropTarget, [
        {
          name: "drop.txt",
          mimeType: "text/plain",
          data: Buffer.from("Dropped attachment").toString("base64"),
        },
      ]);

      await expect(chatSection.getByText("drop.txt")).toBeVisible();

      await input.fill("Dropped file");
      await input.press("Enter");

      const attachmentButton = chatSection
        .getByRole("button", { name: "drop.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText("Dropped attachment");
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("chat section attachment remove and clear", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);

    try {
      const chatSection = await ensureChatSection(
        page,
        page.request,
        "__pw_chat_clear__",
      );
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const fileInput = chatSection.locator('input[type="file"]').first();
      await fileInput.setInputFiles([
        {
          name: "first.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("first"),
        },
        {
          name: "second.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("second"),
        },
      ]);

      await expect(chatSection.getByText("first.txt")).toBeVisible();
      await expect(chatSection.getByText("second.txt")).toBeVisible();

      await chatSection.getByRole("button", { name: "Clear all" }).click();
      await expect(chatSection.getByText("first.txt")).toHaveCount(0);
      await expect(chatSection.getByText("second.txt")).toHaveCount(0);

      await fileInput.setInputFiles({
        name: "third.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("third"),
      });
      await expect(chatSection.getByText("third.txt")).toBeVisible();
      const thirdLabel = chatSection.getByText("third.txt");
      const thirdPill = thirdLabel.locator("..");
      await thirdPill.locator("button").first().click();
      await expect(chatSection.getByText("third.txt")).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("chat section attachment size limit warning", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);

    try {
      const chatSection = await ensureChatSection(
        page,
        page.request,
        "__pw_chat_limit__",
      );
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const fileInput = chatSection.locator('input[type="file"]').first();
      const oversized = Buffer.alloc(25 * 1024 * 1024 + 1, "a");
      await fileInput.setInputFiles({
        name: "oversized.txt",
        mimeType: "text/plain",
        buffer: oversized,
      });

      await expect(chatSection.getByText(/File exceeds/i)).toBeVisible();
      const inputContainer = input.locator("..");
      await expect(inputContainer.getByText("oversized.txt")).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });

  test("chat attachment preview supports common file types", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, page.request);

    try {
      const chatSection = await ensureChatSection(
        page,
        page.request,
        "__pw_chat_preview__",
      );
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const fileInput = chatSection.locator('input[type="file"]').first();
      await fileInput.setInputFiles([
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_pdf.pdf"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_audio.mp3"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_video.mp4"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_text.txt"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_image.jpg"),
      ]);

      await expect(chatSection.getByText("sample_pdf.pdf")).toBeVisible();
      await expect(chatSection.getByText("sample_audio.mp3")).toBeVisible();
      await expect(chatSection.getByText("sample_video.mp4")).toBeVisible();
      await expect(chatSection.getByText("sample_text.txt")).toBeVisible();
      await expect(chatSection.getByText("sample_image.jpg")).toBeVisible();

      await input.fill("Preview types");
      await input.press("Enter");

      await chatSection.getByText("sample_pdf.pdf").first().click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("iframe")).toBeVisible();

      await modal.getByRole("button", { name: "sample_audio.mp3" }).click();
      await expect(modal.locator("audio")).toBeVisible();

      await modal.getByRole("button", { name: "sample_video.mp4" }).click();
      await expect(modal.locator("video")).toBeVisible();

      await modal.getByRole("button", { name: "sample_text.txt" }).click();
      await expect(modal.locator("pre")).toBeVisible();

      await modal.getByRole("button", { name: "sample_image.jpg" }).click();
      await expect(modal.locator("img.object-contain")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page.request, projectContext);
    }
  });
});

async function setOverviewTab(page: Page, tabName: string): Promise<void> {
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

async function getVisibleProjectChatSurface(page: Page): Promise<Locator> {
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

async function collapseSidePanesForWindowInteraction(
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

async function selectProjectAiEngine(
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

async function syncManagedAIFrontendState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } = await import(
      "/src/state/actions/ai.ts"
    );
    await loadLLMConfig();
    await loadLLMApiKeys();
    await loadEngineConfigs(true);
  });
}

async function postBackend<T>(
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

async function getBackend<T>(
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

async function postManagedAPIKeys(
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

async function startManagedChatProviderServer(): Promise<ManagedChatProviderServer> {
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

async function startManagedAnthropicAttachmentProviderServer(): Promise<ManagedAnthropicProviderServer> {
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

async function startManagedGeminiAttachmentProviderServer(): Promise<ManagedGeminiProviderServer> {
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

async function startManagedAzureAttachmentProviderServer(): Promise<ManagedAzureProviderServer> {
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

async function getCurrentProjectConfigId(
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

async function openIsolatedProject(
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

async function cleanupIsolatedProject(
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

async function resolveUniqueSectionName(
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

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

async function ensureChatSection(
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

async function dropFiles(
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
