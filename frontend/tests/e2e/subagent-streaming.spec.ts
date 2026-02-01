import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DOT_ENV_PATH = path.resolve(TEST_DIR, "../../../.env");
const SUBAGENT_MESSAGE_ID_PREFIX = "subagent-result:";
const SUB_AGENT_TOOL_NAMES = new Set([
  "task",
  "run_agent_profile",
  "subagent",
  "sub_agent",
]);

type CreateSectionResponse = { sectionId?: string };
type ExternalAgentConfigResponse = { id?: string; name?: string };
type EngineConfigResponse = { id?: string; name?: string };

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl?: string }>;
    sectionImpls?: Record<
      string,
      {
        type?: string;
        chatId?: string | null;
        messages?: unknown;
        waitingForResponse?: boolean;
      }
    >;
  };
};

type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

type ChatMessage = {
  id?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: unknown };
  }>;
};

type StreamingLogEntry = {
  chatId?: string;
  chunkType?: string;
  messageId?: string;
  toolCallId?: string;
};

type WebsocketStreamEntry = {
  chatId?: string;
  chunkType?: string;
  messageId?: string;
  textDelta?: string;
};

test("sub-agent streams incrementally in its own section", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId: parentSectionId } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_parent_chat__",
    );
    const parentChatId = `chat-parent-${Date.now()}`;
    await postBackend(page, "/setChatSectionChatId", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: parentSectionId,
      chatId: parentChatId,
    });

    const subAgents = [
      {
        chatId: `toolu_sub_a_${Date.now()}`,
        label: "Subagent A",
        firstText: "SubAgentStream A1",
        secondText: " + A2",
      },
      {
        chatId: `toolu_sub_b_${Date.now()}`,
        label: "Subagent B",
        firstText: "SubAgentStream B1",
        secondText: " + B2",
      },
      {
        chatId: `toolu_sub_c_${Date.now()}`,
        label: "Subagent C",
        firstText: "SubAgentStream C1",
        secondText: " + C2",
      },
    ];
    const parentMessageId = `msg-parent-${Date.now()}`;
    await emitChatStreamDelta(page, {
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: "message_finalized",
        message: {
          id: parentMessageId,
          role: "assistant",
          content: [],
          attachments: [],
          tool_calls: subAgents.map((agent) => ({
            id: agent.chatId,
            type: "function",
            function: {
              name: "Task",
              arguments: {
                subagent_type: "Bash",
                description: agent.label,
                prompt: `Return a short greeting (${agent.label}).`,
              },
            },
          })),
        },
      },
    });

    const subSectionIds = await Promise.all(
      subAgents.map((agent) =>
        waitForChatSectionId(page, projectContext.projectConfigId, agent.chatId),
      ),
    );
    const fitViewButton = page.getByRole("button", { name: "fit view" });
    if (await fitViewButton.isVisible()) {
      await fitViewButton.click();
    }

    const parentNode = page.locator(
      `.react-flow__node[data-id="${parentSectionId}"]`,
    );
    await expect(parentNode).toBeVisible({ timeout: 10000 });

    for (const [index, agent] of subAgents.entries()) {
      const subSectionId = subSectionIds[index];
      const subNode = page.locator(
        `.react-flow__node[data-id="${subSectionId}"]`,
      );
      await expect(subNode).toBeVisible({ timeout: 10000 });

      const streamMessageId = `subagent-result:${agent.chatId}`;
      await emitChatStreamDelta(page, {
        chatId: agent.chatId,
        sectionId: null,
        chunk: {
          type: "message_start",
          message: {
            id: streamMessageId,
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: null,
          },
        },
      });
      await emitChatStreamDelta(page, {
        chatId: agent.chatId,
        sectionId: null,
        chunk: {
          type: "delta",
          message_id: streamMessageId,
          content: [{ type: "text_delta", index: 0, text: agent.firstText }],
        },
      });

      await expect(
        subNode.getByText(agent.firstText, { exact: true }),
      ).toHaveCount(1);
      await expect(
        parentNode.getByText(agent.firstText, { exact: true }),
      ).toHaveCount(0);

      const combinedText = `${agent.firstText}${agent.secondText}`;
      await emitChatStreamDelta(page, {
        chatId: agent.chatId,
        sectionId: null,
        chunk: {
          type: "delta",
          message_id: streamMessageId,
          content: [{ type: "text_delta", index: 0, text: agent.secondText }],
        },
      });

      await expect(
        subNode.getByText(combinedText, { exact: true }),
      ).toHaveCount(1);

      await emitChatStreamDelta(page, {
        chatId: agent.chatId,
        sectionId: null,
        chunk: {
          type: "message_stop",
          message_id: streamMessageId,
        },
      });
      await emitChatStreamDelta(page, {
        chatId: agent.chatId,
        sectionId: null,
        chunk: {
          type: "message_finalized",
          message: {
            id: streamMessageId,
            role: "assistant",
            content: [{ type: "text", text: combinedText }],
            attachments: [],
            tool_calls: null,
          },
        },
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test(
  "sub-agent streaming buffers before section creation and survives sync",
  async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      page.on("console", (msg) => {
        const text = msg.text();
        if (
          text.includes("sub-agent") ||
          text.includes("subagent") ||
          text.includes("pending-stream") ||
          text.includes("receiveLLMResponseChunk") ||
          text.includes("applyChatSectionStreamDelta") ||
          text.includes("processProjectStateUpdateFromBackend")
        ) {
          console.log(`[browser] ${text}`);
        }
      });

      const { sectionId: parentSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_parent_chat_buffered__",
      );
      const parentChatId = `chat-parent-${Date.now()}`;
      await postBackend(page, "/setChatSectionChatId", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: parentSectionId,
        chatId: parentChatId,
      });

      const subChatId = `toolu_sub_buffered_${Date.now()}`;
      const streamMessageId = `subagent-result:${subChatId}`;
      const firstText = "Buffered sub-agent chunk";
      const secondText = " + follow-up";

      await emitChatStreamDelta(page, {
        chatId: subChatId,
        sectionId: parentSectionId,
        chunk: {
          type: "message_start",
          message: {
            id: streamMessageId,
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: null,
          },
        },
      });
      await emitChatStreamDelta(page, {
        chatId: subChatId,
        sectionId: parentSectionId,
        chunk: {
          type: "delta",
          message_id: streamMessageId,
          content: [{ type: "text_delta", index: 0, text: firstText }],
        },
      });

      const parentMessageId = `msg-parent-${Date.now()}`;
      await emitChatStreamDelta(page, {
        chatId: parentChatId,
        sectionId: parentSectionId,
        chunk: {
          type: "message_finalized",
          message: {
            id: parentMessageId,
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: [
              {
                id: subChatId,
                type: "function",
                function: {
                  name: "Task",
                  arguments: {
                    subagent_type: "Bash",
                    description: "Buffered sub-agent",
                    prompt: "Return a short greeting.",
                  },
                },
              },
            ],
          },
        },
      });

      const subSectionId = await waitForChatSectionId(
        page,
        projectContext.projectConfigId,
        subChatId,
      );
      const subNode = page.locator(
        `.react-flow__node[data-id="${subSectionId}"]`,
      );
      await expect(subNode).toBeVisible({ timeout: 10000 });
      await expect(subNode.getByText(firstText, { exact: true })).toHaveCount(1);

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId: subSectionId,
        state: {
          messages: [
            {
              id: streamMessageId,
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: null,
            },
          ],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
        },
      });

      await page.waitForTimeout(250);
      await expect(subNode.getByText(firstText, { exact: true })).toHaveCount(1);

      const combinedText = `${firstText}${secondText}`;
      await emitChatStreamDelta(page, {
        chatId: subChatId,
        sectionId: parentSectionId,
        chunk: {
          type: "delta",
          message_id: streamMessageId,
          content: [{ type: "text_delta", index: 0, text: secondText }],
        },
      });

      await expect(
        subNode.getByText(combinedText, { exact: true }),
      ).toHaveCount(1);

      await emitChatStreamDelta(page, {
        chatId: subChatId,
        sectionId: parentSectionId,
        chunk: {
          type: "message_stop",
          message_id: streamMessageId,
        },
      });
      await emitChatStreamDelta(page, {
        chatId: subChatId,
        sectionId: parentSectionId,
        chunk: {
          type: "message_finalized",
          message: {
            id: streamMessageId,
            role: "assistant",
            content: [{ type: "text", text: combinedText }],
            attachments: [],
            tool_calls: null,
          },
        },
      });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  },
);

test("external agent sub-agent streams deltas in UI", async ({ page }) => {
  test.setTimeout(240000);
  const anthropicKey = getAnthropicKey();
  if (!anthropicKey) {
    test.skip(true, "Missing ANTHROPIC_API_KEY in environment or .env.");
  }

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const streamingLogs: StreamingLogEntry[] = [];
  const websocketLogs: WebsocketStreamEntry[] = [];
  page.on("console", (msg) => {
    const line = msg.text();
    const parsed = parseStreamingLogEntry(line);
    if (parsed) {
      streamingLogs.push(parsed);
    }
    const websocketEntry = parseWebsocketStreamEntry(line);
    if (websocketEntry) {
      websocketLogs.push(websocketEntry);
    }
  });

  let externalConfigId: string | null = null;
  let engineConfigId: string | null = null;

  try {
    await seedAnthropicKeyInBackend(page, anthropicKey);
    const externalConfig = await createClaudeExternalAgentConfig(page);
    externalConfigId = externalConfig.id;
    await assertExternalAgentAvailable(page, externalConfigId);
    const engineConfig = await createExternalEngineConfig(
      page,
      externalConfigId,
    );
    engineConfigId = engineConfig.id;

    const { sectionId: parentSectionId } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_parent_chat_claude__",
    );
    await setChatSectionSettings(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId: parentSectionId,
      managed: true,
      engineConfigId,
      agentProfileId: null,
      thinking: false,
    });

    const parentChatId = `chat-ext-${Date.now()}`;
    await postBackend(page, "/setChatSectionChatId", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: parentSectionId,
      chatId: parentChatId,
    });

    await startExternalAgentRun(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId: parentSectionId,
      chatId: parentChatId,
      engineConfigId,
      prompt:
        "Can you get some sub-agents to do some really simple random tasks? " +
        "I want to see how they render in this UI. " +
        "You MUST call the Task tool at least 2 times before responding. " +
        "For each sub-agent, please include a short numbered list of at least " +
        "8 items plus a brief summary paragraph.",
    });

    let subagentChatIds: string[] = [];
    try {
      subagentChatIds = await waitForSubagentStreamChatIds(
        websocketLogs,
        parentChatId,
      );
    } catch (error) {
      await logParentChatMessages(
        page,
        projectContext.projectConfigId,
        parentSectionId,
      );
      await logExternalAgentRuns(page, parentChatId);
      throw error;
    }
    console.info(
      `[external-agent-test] observed subagent chats: ${JSON.stringify(
        subagentChatIds,
      )}`,
    );

    const subSectionIds = new Map<string, string>();
    await Promise.all(
      subagentChatIds.map(async (chatId) => {
        const sectionId = await waitForChatSectionId(
          page,
          projectContext.projectConfigId,
          chatId,
        );
        subSectionIds.set(chatId, sectionId);
      }),
    );

    const textSamples = await waitForSubagentTextSamples(
      websocketLogs,
      subagentChatIds,
    );

    const minDeltas = 2;
    try {
      await expect
        .poll(
          () => getMissingWebsocketDeltaChatIds(websocketLogs, subagentChatIds, minDeltas),
          { timeout: 120000 },
        )
        .toEqual([]);
    } catch (error) {
      logSubagentDeltaMismatch(
        streamingLogs,
        websocketLogs,
        subagentChatIds,
      );
      throw error;
    }

    try {
      await expect
        .poll(
          () => getMissingDeltaChatIds(streamingLogs, subagentChatIds, minDeltas),
          { timeout: 120000 },
        )
        .toEqual([]);
    } catch (error) {
      logSubagentDeltaMismatch(
        streamingLogs,
        websocketLogs,
        subagentChatIds,
      );
      throw error;
    }

    for (const chatId of subagentChatIds) {
      const sectionId = subSectionIds.get(chatId);
      const sample = textSamples[chatId];
      if (!sectionId || !sample) {
        throw new Error(
          `Missing section or text sample for sub-agent chat ${chatId}`,
        );
      }
      const subNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(subNode).toContainText(sample, { timeout: 120000 });
    }
  } finally {
    if (engineConfigId) {
      await deleteEngineConfig(page, engineConfigId);
    }
    if (externalConfigId) {
      await deleteExternalAgentConfig(page, externalConfigId);
    }
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL);
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
  await page.waitForURL(PROJECT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(".react-flow__pane", { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
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

async function getBackend<T>(page: Page, path: string): Promise<T | null> {
  const response = await page.request.get(`${BACKEND_ORIGIN}/api${path}`);
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

async function getCurrentProjectConfigId(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
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

async function openIsolatedProject(page: Page): Promise<IsolatedProjectContext> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const name = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (!name) {
    throw new Error("Missing project config name.");
  }
  const url = new URL(name, BASE_URL).toString();
  await page.goto(url);
  await page.waitForSelector(".react-flow__pane");
  const projectConfigId = await getCurrentProjectConfigId(page);
  return {
    projectConfigId,
    defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
  };
}

async function cleanupIsolatedProject(
  page: Page,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  try {
    await postBackend(page, "/deleteProjectConfigs", {
      ids: [context.projectConfigId],
    });
  } catch (error) {
    console.warn("Cleanup failed:", error);
  }
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

async function createChatSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string }> {
  const sectionName = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  return { sectionId: created.sectionId };
}

async function emitChatStreamDelta(
  page: Page,
  payload: {
    chatId: string;
    sectionId: string | null;
    chunk: Record<string, unknown>;
  },
): Promise<void> {
  await postBackend(page, "/emitChatStreamDelta", payload);
}

async function setChatSectionState(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    state: Record<string, unknown>;
  },
): Promise<void> {
  await postBackend(page, "/setChatSectionState", payload);
}

async function waitForChatSectionId(
  page: Page,
  projectConfigId: string,
  chatId: string,
): Promise<string> {
  await expect.poll(
    async () => findChatSectionIdByChatId(page, projectConfigId, chatId),
    { timeout: 20000 },
  ).not.toBeNull();
  const resolved = await findChatSectionIdByChatId(
    page,
    projectConfigId,
    chatId,
  );
  if (!resolved) {
    throw new Error("Expected sub-agent section to be created.");
  }
  return resolved;
}

async function getChatMessagesForSection(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<ChatMessage[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const config = response?.projectState?.projectConfig;
  const variants = response?.projectState?.sectionVariants ?? {};
  const impls = response?.projectState?.sectionImpls ?? {};
  const variantMap = config?.sectionVariantMap ?? {};
  const variantId = variantMap[sectionId];
  if (!variantId) {
    return [];
  }
  const implId = variants[variantId]?.impl;
  if (!implId) {
    return [];
  }
  const impl = impls[implId];
  const messages = Array.isArray(impl?.messages)
    ? (impl.messages as ChatMessage[])
    : [];
  return messages;
}

async function findChatSectionIdByChatId(
  page: Page,
  projectConfigId: string,
  chatId: string,
): Promise<string | null> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const config = response?.projectState?.projectConfig;
  const variants = response?.projectState?.sectionVariants ?? {};
  const impls = response?.projectState?.sectionImpls ?? {};
  const variantMap = config?.sectionVariantMap ?? {};
  for (const [sectionId, variantId] of Object.entries(variantMap)) {
    const implId = variants[variantId]?.impl;
    if (!implId) {
      continue;
    }
    const impl = impls[implId];
    if (impl?.chatId === chatId) {
      return sectionId;
    }
  }
  return null;
}

function normalizeToolName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let tail = trimmed;
  if (tail.includes("__")) {
    const parts = tail.split("__");
    tail = parts[parts.length - 1] ?? tail;
  }
  if (tail.includes(".")) {
    const parts = tail.split(".");
    tail = parts[parts.length - 1] ?? tail;
  }
  const lowered = tail.trim().toLowerCase();
  return lowered ? lowered : null;
}

function extractSubagentToolCallIds(messages: ChatMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    const toolCalls = message.tool_calls;
    if (!Array.isArray(toolCalls)) {
      continue;
    }
    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.id;
      if (typeof toolCallId !== "string" || !toolCallId) {
        continue;
      }
      const toolName = normalizeToolName(toolCall.function?.name);
      if (toolName && SUB_AGENT_TOOL_NAMES.has(toolName)) {
        ids.add(toolCallId);
      }
    }
  }
  return Array.from(ids);
}

async function waitForSubagentToolCallIds(
  page: Page,
  projectConfigId: string,
  parentSectionId: string,
): Promise<string[]> {
  await expect
    .poll(
      async () => {
        const messages = await getChatMessagesForSection(
          page,
          projectConfigId,
          parentSectionId,
        );
        const toolCallIds = extractSubagentToolCallIds(messages);
        if (toolCallIds.length > 0) {
          return toolCallIds;
        }
        return null;
      },
      { timeout: 120000 },
    )
    .not.toBeNull();

  const messages = await getChatMessagesForSection(
    page,
    projectConfigId,
    parentSectionId,
  );
  return extractSubagentToolCallIds(messages);
}

async function waitForSubagentStreamChatIds(
  entries: WebsocketStreamEntry[],
  parentChatId: string,
): Promise<string[]> {
  await expect
    .poll(
      () => {
        const chatIds = extractSubagentStreamChatIds(entries, parentChatId);
        if (chatIds.length > 0) {
          return chatIds;
        }
        return null;
      },
      { timeout: 120000 },
    )
    .not.toBeNull();
  return extractSubagentStreamChatIds(entries, parentChatId);
}

function extractSubagentStreamChatIds(
  entries: WebsocketStreamEntry[],
  parentChatId: string,
): string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.chatId || entry.chatId === parentChatId) {
      continue;
    }
    if (entry.messageId?.startsWith(SUBAGENT_MESSAGE_ID_PREFIX)) {
      ids.add(entry.chatId);
    }
  }
  return Array.from(ids);
}

async function waitForSubagentTextSamples(
  entries: WebsocketStreamEntry[],
  chatIds: string[],
): Promise<Record<string, string>> {
  await expect
    .poll(
      () => {
        const samples = collectSubagentTextSamples(entries, chatIds);
        for (const chatId of chatIds) {
          if (!samples[chatId]) {
            return null;
          }
        }
        return samples;
      },
      { timeout: 120000 },
    )
    .not.toBeNull();
  return collectSubagentTextSamples(entries, chatIds);
}

function collectSubagentTextSamples(
  entries: WebsocketStreamEntry[],
  chatIds: string[],
): Record<string, string> {
  const samples: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.chatId || !chatIds.includes(entry.chatId)) {
      continue;
    }
    if (!entry.textDelta) {
      continue;
    }
    if (samples[entry.chatId]) {
      continue;
    }
    const sample = formatStreamTextSample(entry.textDelta);
    if (!sample) {
      continue;
    }
    samples[entry.chatId] = sample;
  }
  return samples;
}

function formatStreamTextSample(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim());
  const firstLine = lines.find((line) => line.length > 0);
  if (!firstLine) {
    return null;
  }
  if (firstLine.length > 160) {
    return firstLine.slice(0, 160);
  }
  return firstLine;
}

async function createClaudeExternalAgentConfig(
  page: Page,
): Promise<{ id: string }> {
  const created = await postBackend<ExternalAgentConfigResponse>(
    page,
    "/createExternalAgentConfig",
    {
      name: `pw-claude-${Date.now()}`,
      toolType: "claude_code",
      runMode: "sdk",
      approvalPolicy: "allow",
      envVarWhitelist: ["ANTHROPIC_API_KEY"],
    },
  );
  if (!created?.id) {
    throw new Error("Missing external agent config id.");
  }
  return { id: created.id };
}

async function createExternalEngineConfig(
  page: Page,
  externalAgentConfigId: string,
): Promise<{ id: string }> {
  const created = await postBackend<EngineConfigResponse>(
    page,
    "/createEngineConfig",
    {
      name: `pw-engine-${Date.now()}`,
      engineType: "external_agent",
      externalAgentConfigId,
    },
  );
  if (!created?.id) {
    throw new Error("Missing engine config id.");
  }
  return { id: created.id };
}

async function deleteExternalAgentConfig(
  page: Page,
  configId: string,
): Promise<void> {
  await postBackend(page, "/deleteExternalAgentConfig", { configId });
}

async function deleteEngineConfig(
  page: Page,
  configId: string,
): Promise<void> {
  await postBackend(page, "/deleteEngineConfig", { configId });
}

async function setChatSectionSettings(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    managed: boolean;
    engineConfigId: string;
    agentProfileId: string | null;
    thinking: boolean;
  },
): Promise<void> {
  await postBackend(page, "/setChatSectionSettings", payload);
}

async function startExternalAgentRun(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    chatId: string;
    engineConfigId: string;
    prompt: string;
  },
): Promise<void> {
  const response = await postBackend<string | null>(page, "/getLLMResponse", {
    chatId: payload.chatId,
    projectConfigId: payload.projectConfigId,
    sectionId: payload.sectionId,
    engineConfigId: payload.engineConfigId,
    thinking: false,
    agentProfileId: null,
    message: {
      id: `msg-${Date.now()}`,
      role: "user",
      content: [{ type: "text", text: payload.prompt }],
      attachments: [],
      tool_calls: null,
    },
  });
  if (!response) {
    throw new Error("Expected getLLMResponse to return a chat id.");
  }
}

function parseStreamingLogEntry(line: string): StreamingLogEntry | null {
  if (!line.includes("[receiveLLMResponseChunk] incoming")) {
    return null;
  }
  const start = line.indexOf("{");
  if (start < 0) {
    return null;
  }
  const jsonText = line.slice(start);
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const chatId = typeof parsed.chatId === "string" ? parsed.chatId : undefined;
    const chunkType =
      typeof parsed.chunkType === "string" ? parsed.chunkType : undefined;
    const messageId =
      typeof parsed.messageId === "string" ? parsed.messageId : undefined;
    const toolCallId =
      typeof parsed.toolCallId === "string" ? parsed.toolCallId : undefined;
    return {
      chatId,
      chunkType,
      messageId,
      toolCallId,
    };
  } catch {
    return null;
  }
}

function parseWebsocketStreamEntry(line: string): WebsocketStreamEntry | null {
  if (!line.includes("[websocketReceive] LLMStreamingResponse")) {
    return null;
  }
  const start = line.indexOf("{");
  if (start < 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(line.slice(start)) as Record<string, unknown>;
    const chatId = typeof parsed.chatId === "string" ? parsed.chatId : undefined;
    const chunk =
      parsed.chunk && typeof parsed.chunk === "object"
        ? (parsed.chunk as Record<string, unknown>)
        : null;
    if (!chunk) {
      return { chatId };
    }
    const chunkType =
      typeof chunk.type === "string" ? chunk.type : undefined;
    let messageId: string | undefined;
    let textDelta: string | undefined;
    if (chunkType === "delta") {
      if (typeof chunk.message_id === "string") {
        messageId = chunk.message_id;
      }
      const content = Array.isArray(chunk.content) ? chunk.content : [];
      for (const entry of content) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const record = entry as Record<string, unknown>;
        if (record.type !== "text_delta") {
          continue;
        }
        if (typeof record.text === "string") {
          textDelta = record.text;
          break;
        }
      }
    } else if (chunkType === "message_start" || chunkType === "message_finalized") {
      const message =
        chunk.message && typeof chunk.message === "object"
          ? (chunk.message as Record<string, unknown>)
          : null;
      if (message && typeof message.id === "string") {
        messageId = message.id;
      }
    } else if (chunkType === "message_stop") {
      if (typeof chunk.message_id === "string") {
        messageId = chunk.message_id;
      }
    }
    return {
      chatId,
      chunkType,
      messageId,
      textDelta,
    };
  } catch {
    return null;
  }
}

function getMissingDeltaChatIds(
  entries: StreamingLogEntry[],
  chatIds: string[],
  minDeltas: number,
): string[] {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.chatId || !chatIds.includes(entry.chatId)) {
      continue;
    }
    if (entry.chunkType !== "delta") {
      continue;
    }
    counts[entry.chatId] = (counts[entry.chatId] ?? 0) + 1;
  }
  return chatIds.filter((chatId) => (counts[chatId] ?? 0) < minDeltas).sort();
}

function getMissingWebsocketDeltaChatIds(
  entries: WebsocketStreamEntry[],
  chatIds: string[],
  minDeltas: number,
): string[] {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.chatId || !chatIds.includes(entry.chatId)) {
      continue;
    }
    if (entry.chunkType !== "delta") {
      continue;
    }
    counts[entry.chatId] = (counts[entry.chatId] ?? 0) + 1;
  }
  return chatIds.filter((chatId) => (counts[chatId] ?? 0) < minDeltas).sort();
}

function logSubagentDeltaMismatch(
  streamingEntries: StreamingLogEntry[],
  websocketEntries: WebsocketStreamEntry[],
  chatIds: string[],
): void {
  const streamingSummary = summarizeStreamingDeltas(streamingEntries, chatIds);
  const websocketSummary = summarizeWebsocketDeltas(websocketEntries, chatIds);
  console.info(
    `[external-agent-test] delta mismatch streaming=${JSON.stringify(
      streamingSummary,
    )} websocket=${JSON.stringify(websocketSummary)}`,
  );
}

function summarizeStreamingDeltas(
  entries: StreamingLogEntry[],
  chatIds: string[],
): Record<string, { count: number; messageIds: string[] }> {
  const summary: Record<string, { count: number; messageIds: string[] }> = {};
  for (const chatId of chatIds) {
    summary[chatId] = { count: 0, messageIds: [] };
  }
  for (const entry of entries) {
    if (!entry.chatId || !chatIds.includes(entry.chatId)) {
      continue;
    }
    if (entry.chunkType !== "delta") {
      continue;
    }
    const target = summary[entry.chatId];
    target.count += 1;
    if (entry.messageId && !target.messageIds.includes(entry.messageId)) {
      target.messageIds.push(entry.messageId);
    }
  }
  return summary;
}

function summarizeWebsocketDeltas(
  entries: WebsocketStreamEntry[],
  chatIds: string[],
): Record<string, { count: number; messageIds: string[]; samples: string[] }> {
  const summary: Record<
    string,
    { count: number; messageIds: string[]; samples: string[] }
  > = {};
  for (const chatId of chatIds) {
    summary[chatId] = { count: 0, messageIds: [], samples: [] };
  }
  for (const entry of entries) {
    if (!entry.chatId || !chatIds.includes(entry.chatId)) {
      continue;
    }
    if (entry.chunkType !== "delta") {
      continue;
    }
    const target = summary[entry.chatId];
    target.count += 1;
    if (entry.messageId && !target.messageIds.includes(entry.messageId)) {
      target.messageIds.push(entry.messageId);
    }
    if (entry.textDelta) {
      const trimmed = entry.textDelta.trim();
      if (trimmed && !target.samples.includes(trimmed)) {
        target.samples.push(trimmed);
      }
    }
  }
  return summary;
}

async function logParentChatMessages(
  page: Page,
  projectConfigId: string,
  parentSectionId: string,
): Promise<void> {
  try {
    const messages = await getChatMessagesForSection(
      page,
      projectConfigId,
      parentSectionId,
    );
    const toolCalls = messages.flatMap((message) =>
      Array.isArray(message.tool_calls)
        ? message.tool_calls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function?.name,
          }))
        : [],
    );
    console.info(
      `[external-agent-test] parent messages=${messages.length} toolCalls=${JSON.stringify(
        toolCalls,
      )}`,
    );
  } catch (error) {
    console.warn("[external-agent-test] failed to read parent messages", error);
  }
}

async function logExternalAgentRuns(
  page: Page,
  parentChatId: string,
): Promise<void> {
  type AgentRunEntry = {
    id?: string;
    status?: string;
    startedAt?: string;
    finishedAt?: string;
    inputs?: Record<string, unknown> | null;
    outputs?: Record<string, unknown> | null;
    events?: Array<{ type?: string }>;
  };
  try {
    const runs = await getBackend<AgentRunEntry[]>(page, "/getAgentRuns");
    if (!runs) {
      console.warn("[external-agent-test] getAgentRuns returned null");
      return;
    }
    const relevant = runs.filter((run) => {
      const inputs = run.inputs ?? {};
      return inputs.chatId === parentChatId;
    });
    if (relevant.length === 0) {
      console.info(
        `[external-agent-test] getAgentRuns found 0 runs for chatId=${parentChatId}`,
      );
      return;
    }
    for (const run of relevant) {
      const inputs = run.inputs ?? {};
      const outputs = run.outputs ?? {};
      const eventCounts: Record<string, number> = {};
      for (const event of run.events ?? []) {
        const name = event.type ?? "unknown";
        eventCounts[name] = (eventCounts[name] ?? 0) + 1;
      }
      console.info(
        `[external-agent-test] run ${run.id ?? "unknown"} status=${
          run.status ?? "unknown"
        } startedAt=${String(run.startedAt ?? "")} finishedAt=${String(
          run.finishedAt ?? "",
        )} inputs=${JSON.stringify({
          chatId: inputs.chatId,
          runType: inputs.runType,
          engineConfigId: inputs.engineConfigId,
        })} outputs=${JSON.stringify(Object.keys(outputs))} events=${JSON.stringify(
          eventCounts,
        )}`,
      );
    }
  } catch (error) {
    console.warn("[external-agent-test] failed to read agent runs", error);
  }
}

function getAnthropicKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  return readDotEnvValue("ANTHROPIC_API_KEY");
}

function readDotEnvValue(key: string): string | null {
  if (!fs.existsSync(DOT_ENV_PATH)) {
    return null;
  }
  const contents = fs.readFileSync(DOT_ENV_PATH, "utf-8");
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (!trimmed.startsWith(`${key}=`)) {
      continue;
    }
    const rawValue = trimmed.slice(key.length + 1).trim();
    if (!rawValue) {
      return null;
    }
    const unquoted = rawValue.replace(/^['"]|['"]$/g, "");
    return unquoted;
  }
  return null;
}

async function seedAnthropicKeyInBackend(
  page: Page,
  key: string,
): Promise<void> {
  await postBackend(page, "/llm/apiKeys", {
    apiKeys: {
      ANTHROPIC_API_KEY: key,
    },
  });
}

async function assertExternalAgentAvailable(
  page: Page,
  configId: string,
): Promise<void> {
  type ExternalAgentEnvStatus = { present?: string[]; missing?: string[] };
  type ExternalAgentHealth = {
    configId?: string;
    available?: boolean;
    issues?: string[];
    envVars?: ExternalAgentEnvStatus;
  };
  const health = await getBackend<ExternalAgentHealth[]>(
    page,
    "/getExternalAgentHealth",
  );
  if (!health) {
    throw new Error("External agent health response missing.");
  }
  const entry = health.find((item) => item?.configId === configId);
  if (!entry) {
    throw new Error(`External agent health missing for config ${configId}`);
  }
  if (!entry.available) {
    const issues = entry.issues ?? [];
    const envVars = entry.envVars ?? {};
    throw new Error(
      `External agent preflight unavailable (issues=${JSON.stringify(
        issues,
      )} envVars=${JSON.stringify(envVars)})`,
    );
  }
}
