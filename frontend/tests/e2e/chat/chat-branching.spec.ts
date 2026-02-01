import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

type EngineConfig = {
  id: string;
  name: string;
  engineType: string;
  settaLlmConfigId?: string | null;
};

type AllLLMConfigs = {
  configs?: Record<
    string,
    { model: string; provider?: string; api_key_env?: string }
  >;
  mcpServers?: Record<string, unknown>;
  default_config_id?: string | null;
};

type CreateSectionResponse = { sectionId?: string };

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};
type AgentRun = {
  inputs?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  events?: Array<{ timestamp?: string | null }>;
};

test.describe.serial("chat branching", () => {
  test("project chat edit creates branch and switcher", async ({
    page,
    request,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, request);

    const engineCleanup = await ensureManagedChatEngine(request);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await overviewPane.getByRole("button", { name: "Thinking" }).click();

      const input = overviewPane.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      await input.fill("Original message");
      await input.press("Enter");

      const originalGroup = getMessageGroup(overviewPane, "Original message");
      await expect(originalGroup).toBeVisible();
      await expect(input).toHaveValue("", { timeout: 20000 });

      await stopLatestProjectChat(request, projectContext.projectConfigId);

      await page.reload();
      await page.waitForSelector(".react-flow__pane");
      const reloadedPane = page.locator("#OverviewPane");
      await expect(
        reloadedPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await reloadedPane.getByRole("button", { name: "Thinking" }).click();

      await reloadedPane
        .getByRole("button", { name: "View History" })
        .click();

      const historyEntry = reloadedPane
        .locator("div.group\\/historyitem")
        .filter({ hasText: "Original message" })
        .first();
      await expect(historyEntry).toBeVisible();
      await historyEntry.click();

      const chatInput = reloadedPane.getByPlaceholder("Type a message...");
      await expect(chatInput).toBeEnabled({ timeout: 20000 });

      const originalMessageId = await getMessageGroupId(
        reloadedPane,
        "Original message",
      );
      const reloadedOriginalGroup = getMessageGroupById(
        reloadedPane,
        originalMessageId,
      );
      await expect(reloadedOriginalGroup).toBeVisible();

      await reloadedOriginalGroup.hover();
      const editButton = reloadedOriginalGroup.getByRole("button", {
        name: "Edit message",
      });
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeEnabled({ timeout: 20000 });
      await editButton.click();

      const editor = reloadedOriginalGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      await editor.fill("Edited message");
      await reloadedOriginalGroup
        .getByRole("button", { name: "Save" })
        .click();

      const editedGroup = getMessageGroup(reloadedPane, "Edited message");
      await expect(editedGroup).toBeVisible();
      await editedGroup.hover();
      await expect(editedGroup.getByText("2/2")).toBeVisible();

      await editedGroup
        .getByRole("button", { name: "Previous branch" })
        .click();

      const revertedGroup = getMessageGroup(reloadedPane, "Original message");
      await expect(revertedGroup).toBeVisible();
      await revertedGroup.hover();
      await expect(revertedGroup.getByText("1/2")).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(request, projectContext);
    }
  });

  test("chat section edit creates branch and switcher", async ({
    page,
    request,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page, request);

    try {
      const { sectionId, sectionName } = await createChatSection(
        request,
        projectContext.projectConfigId,
        "__pw_branch_section__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(request, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-1",
              role: "user",
              content: [{ type: "text", text: "Original section" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const originalMessageId = await getMessageGroupId(
        section,
        "Original section",
      );
      const originalGroup = getMessageGroupById(section, originalMessageId);
      await expect(originalGroup).toBeVisible();

      await originalGroup.hover();
      await originalGroup.getByRole("button", { name: "Edit message" }).click();

      const editor = originalGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      await editor.fill("Edited section");
      await originalGroup.getByRole("button", { name: "Save" }).click();

      const editedGroup = getMessageGroup(section, "Edited section");
      await expect(editedGroup).toBeVisible();
      await editedGroup.hover();
      await expect(editedGroup.getByText("2/2")).toBeVisible();

      await editedGroup
        .getByRole("button", { name: "Previous branch" })
        .click();

      const revertedGroup = getMessageGroup(section, "Original section");
      await expect(revertedGroup).toBeVisible();
      await revertedGroup.hover();
      await expect(revertedGroup.getByText("1/2")).toBeVisible();
    } finally {
      await cleanupIsolatedProject(request, projectContext);
    }
  });
});

function getMessageGroup(container: Locator, text: string): Locator {
  return container.locator("div.group").filter({ hasText: text }).first();
}

function getMessageGroupById(container: Locator, messageId: string): Locator {
  return container
    .locator(`div.group[data-message-id="${messageId}"]`)
    .first();
}

async function getMessageGroupId(
  container: Locator,
  text: string,
): Promise<string> {
  const group = getMessageGroup(container, text);
  const messageId = await group.getAttribute("data-message-id");
  if (!messageId) {
    throw new Error(`Missing message id for text: ${text}`);
  }
  return messageId;
}

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
    const match = metadata.projectMetadata.find((entry) => entry.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
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

async function ensureManagedChatEngine(
  request: APIRequestContext,
): Promise<() => Promise<void>> {
  const initialConfig = await getBackend<AllLLMConfigs>(request, "/llm/config");
  if (!initialConfig) {
    throw new Error("Missing LLM config payload.");
  }
  let createdLlmConfigId: string | null = null;
  let didUpdateLlmConfig = false;
  const existingConfigs = initialConfig.configs ?? {};

  const engineConfigs = await getBackend<EngineConfig[]>(
    request,
    "/getEngineConfigs",
  );
  const existingEngine =
    engineConfigs?.find((config) => config.engineType === "setta_llm") ?? null;

  let llmConfigId = existingEngine?.settaLlmConfigId ?? null;
  if (llmConfigId && !existingConfigs[llmConfigId]) {
    const updated: AllLLMConfigs = {
      ...initialConfig,
      configs: {
        ...existingConfigs,
        [llmConfigId]: {
          model: "gpt-4o-mini",
          provider: "openai",
        },
      },
      default_config_id: initialConfig.default_config_id ?? llmConfigId,
    };
    await postBackend(request, "/llm/config", updated as Record<string, unknown>);
    createdLlmConfigId = llmConfigId;
    didUpdateLlmConfig = true;
  }

  if (!llmConfigId) {
    llmConfigId =
      Object.entries(existingConfigs).find(
        ([, config]) => !config.api_key_env,
      )?.[0] ?? null;
  }

  if (!llmConfigId) {
    llmConfigId = "e2e-llm";
    const updated: AllLLMConfigs = {
      ...initialConfig,
      configs: {
        ...existingConfigs,
        [llmConfigId]: {
          model: "gpt-4o-mini",
          provider: "openai",
        },
      },
      default_config_id: llmConfigId,
    };
    await postBackend(request, "/llm/config", updated as Record<string, unknown>);
    createdLlmConfigId = llmConfigId;
    didUpdateLlmConfig = true;
  }

  let createdEngineConfigId: string | null = null;
  if (!existingEngine) {
    const created = await postBackend<EngineConfig>(
      request,
      "/createEngineConfig",
      {
        name: "E2E Engine",
        engineType: "setta_llm",
        settaLlmConfigId: llmConfigId,
        defaults: {},
      },
    );
    if (!created?.id) {
      throw new Error("Missing engine config id.");
    }
    createdEngineConfigId = created.id;
  }

  return async () => {
    if (createdEngineConfigId) {
      await postBackend(request, "/deleteEngineConfig", {
        configId: createdEngineConfigId,
      });
    }
    if (createdLlmConfigId || didUpdateLlmConfig) {
      await postBackend(
        request,
        "/llm/config",
        initialConfig as Record<string, unknown>,
      );
    }
  };
}

async function createChatSection(
  request: APIRequestContext,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string; sectionName: string }> {
  const sectionName = `${baseName}-${Date.now()}`;
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
  return { sectionId: created.sectionId, sectionName };
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}

async function setChatSectionState(
  request: APIRequestContext,
  payload: {
    projectConfigId: string;
    sectionId: string;
    state: Record<string, unknown>;
  },
): Promise<void> {
  await postBackend(request, "/setChatSectionState", payload);
}

async function stopLatestProjectChat(
  request: APIRequestContext,
  projectConfigId: string,
): Promise<void> {
  const chatId = await waitForLatestChatId(request, projectConfigId);
  await postBackend(request, "/stopLLMChat", { chatId });
}

async function waitForLatestChatId(
  request: APIRequestContext,
  projectConfigId: string,
): Promise<string> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const runs = (await getBackend<AgentRun[]>(request, "/getAgentRuns")) ?? [];
    const latest = findLatestChatRun(runs, projectConfigId);
    if (latest) {
      const chatId = getRunInputString(latest, "chatId");
      if (chatId) {
        return chatId;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for project chat run.");
}

function findLatestChatRun(
  runs: AgentRun[],
  projectConfigId: string,
): AgentRun | null {
  const filtered = runs.filter((run) => {
    const runType = getRunInputString(run, "runType");
    if (runType !== "llm_chat") {
      return false;
    }
    const runProjectId = getRunInputString(run, "projectConfigId");
    return runProjectId === projectConfigId;
  });
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((latest, run) => {
    if (!latest) {
      return run;
    }
    return getRunTimestamp(run) > getRunTimestamp(latest) ? run : latest;
  }, filtered[0] ?? null);
}

function getRunInputString(run: AgentRun, key: string): string | null {
  const inputs = run.inputs;
  if (!inputs || typeof inputs !== "object") {
    return null;
  }
  if (Array.isArray(inputs)) {
    return null;
  }
  const raw = inputs[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return null;
}

function getRunTimestamp(run: AgentRun): number {
  const eventTimestamps = (run.events ?? [])
    .map((event) => Date.parse(event.timestamp ?? ""))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = Date.parse(run.startedAt ?? "");
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}
