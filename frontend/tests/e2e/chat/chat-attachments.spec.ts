import { expect, test } from "@playwright/test";
import path from "path";
import { ensureAppReady } from "../helpers";
import {
  ATTACHMENT_FIXTURES_DIR,
  cleanupIsolatedProject,
  dropFiles,
  ensureChatSection,
  getBackend,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  postBackend,
  postManagedAPIKeys,
  providerRequestsForPath,
  selectProjectAiEngine,
  setOverviewTab,
  startManagedAnthropicAttachmentProviderServer,
  startManagedAzureAttachmentProviderServer,
  startManagedChatProviderServer,
  startManagedGeminiAttachmentProviderServer,
  syncManagedAIFrontendState,
  type EngineConfig,
  type LLMConfigPayload,
  type ManagedAPIKeysSnapshot,
} from "./chat-attachments-helpers";

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

      const chatCompletionRequests = () =>
        providerRequestsForPath(
          providerServer.requests,
          "/v1/chat/completions",
        );
      await expect.poll(() => chatCompletionRequests().length).toBe(1);
      const providerRequest = chatCompletionRequests()[0];
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

      const chatCompletionRequests = () =>
        providerRequestsForPath(
          providerServer.requests,
          "/v1/chat/completions",
        );
      await expect.poll(() => chatCompletionRequests().length).toBe(1);
      const providerRequest = chatCompletionRequests()[0];
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
    const providerServer =
      await startManagedAnthropicAttachmentProviderServer();
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

      const messageRequests = () =>
        providerRequestsForPath(providerServer.requests, "/v1/messages");
      await expect.poll(() => messageRequests().length).toBe(1);
      const providerRequest = messageRequests()[0];
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

      const streamGenerateContentRequests = () =>
        providerRequestsForPath(
          providerServer.requests,
          "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
        );
      await expect.poll(() => streamGenerateContentRequests().length).toBe(1);
      const providerRequest = streamGenerateContentRequests()[0];
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

      const azureChatCompletionRequests = () =>
        providerRequestsForPath(
          providerServer.requests,
          "/openai/deployments/gpt-4o-mini/chat/completions",
        );
      await expect.poll(() => azureChatCompletionRequests().length).toBe(1);
      const providerRequest = azureChatCompletionRequests()[0];
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
