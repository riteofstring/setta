import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureProjectChatThreadsPanelVisible,
  ensureAppReady,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

async function seedAIStore(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((nextState) => {
    const key = "setta_ai_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state !== null
              ? (parsed.state as Record<string, unknown>)
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

function buildAppGenSkillsResponse(
  skills: Array<Record<string, unknown>>,
  overrides: {
    customSkillCreateRootPath?: string | null;
    customSkillCreateRootActionable?: boolean;
  } = {},
) {
  return {
    skills,
    customSkillCreateRootPath: overrides.customSkillCreateRootPath ?? null,
    customSkillCreateRootActionable:
      overrides.customSkillCreateRootActionable ?? false,
  };
}

function buildUpsertAppGenCustomSkillResponse({
  skillId,
  created,
  rootPath,
  rootLabel,
  relativePath,
  content,
  description = "",
  isEditable = true,
  editabilityReason = null,
}: {
  skillId: string;
  created: boolean;
  rootPath: string;
  rootLabel: string;
  relativePath: string;
  content: string;
  description?: string;
  isEditable?: boolean;
  editabilityReason?: string | null;
}) {
  const name =
    relativePath === "." ? rootPath.split("/").pop() ?? "skills" : relativePath;
  const skillDocPath =
    relativePath === "."
      ? `${rootPath}/SKILL.md`
      : `${rootPath}/${relativePath}/SKILL.md`;
  return {
    skillId,
    created,
    rootPath,
    skillDocPath,
    skill: {
      skillId,
      name,
      rootLabel,
      rootPath,
      relativePath,
      isEditable,
      editabilityReason,
      description,
    },
    skillContent: {
      skillId,
      content,
      truncated: false,
      originalSizeBytes: Buffer.byteLength(content, "utf8"),
    },
  };
}

async function expectHasEllipsisTruncation(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const styleInfo = await locator.evaluate((node) => {
    const element = node as HTMLElement;
    const style = window.getComputedStyle(element);
    return {
      overflowX: style.overflowX,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });

  expect(styleInfo.textOverflow).toBe("ellipsis");
  expect(styleInfo.whiteSpace).toBe("nowrap");
  expect(["hidden", "clip"]).toContain(styleInfo.overflowX);
  expect(styleInfo.scrollWidth).toBeGreaterThanOrEqual(styleInfo.clientWidth);
}

async function openSkillsViewer(page: Page): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const settingsButton = projectChatSurface.getByRole("button", {
    name: "Project AI Settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await page.getByTestId("project-chat-settings-open-skills").click();
}

async function openMcpViewer(page: Page): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const settingsButton = projectChatSurface.getByRole("button", {
    name: "Project AI Settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await page.getByTestId("project-chat-settings-open-mcp").click();
}

async function openSlashCommandsViewer(page: Page): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const settingsButton = projectChatSurface.getByRole("button", {
    name: "Project AI Settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await page.getByTestId("project-chat-settings-open-slash-commands").click();
}

async function closeSkillsMcpViewer(page: Page): Promise<void> {
  const returnToChatButton = page.getByRole("button", { name: "Return to chat" });
  await expect(returnToChatButton).toBeVisible();
  await returnToChatButton.evaluate((element: HTMLElement) => {
    element.click();
  });
}

async function openRawSkillMarkdown(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skill Markdown Viewer" }).click();
  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-raw",
  );
}

async function clickSkillMarkdownViewToggle(
  page: Page,
  testId: "project-chat-skill-markdown-view-raw" | "project-chat-skill-markdown-view-rendered",
): Promise<void> {
  const toggle = page.getByTestId(testId);
  await expect(toggle).toBeVisible();
  await toggle.evaluate((element: HTMLElement) => {
    element.click();
  });
}

test("project ai chat can open the skills side view", async ({ page }) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
          {
            skillId: "user_codex_skills::frontend-design",
            name: "frontend-design",
            rootLabel: "User ~/.codex/skills",
            rootPath: "/home/.codex/skills",
            relativePath: "frontend-design",
            description: "Create polished frontend interfaces.",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
          context7: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@upstash/context7-mcp"],
          },
        },
        defaultMcpServerIds: ["setta", "context7"],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_skills::ui-layout",
        content: "# UI Layout\n\nCreate dense dashboard layouts.",
      }),
    });
  });

  await ensureAppReady(page);

  await openSkillsViewer(page);

  await expect(page.getByTestId("project-chat-skills-view")).toBeVisible();
  await expect(page.getByTestId("project-chat-skills-content")).toBeVisible();
  await expect(page.getByTestId("project-chat-aux-tabs")).toBeVisible();
  await expect(page.getByTestId("project-chat-aux-tab-skills")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("project-chat-aux-tab-mcp")).toBeVisible();
  await expect(
    page.getByTestId("project-chat-aux-tab-slash-commands"),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-aux-tab-ai-settings"),
  ).toBeVisible();
  await expect(page.getByTestId("project-chat-skills-refresh")).toBeVisible();
  await expect(page.getByText("/workspace/skills")).toBeVisible();
  await expect(page.getByText("/home/.codex/skills")).toBeVisible();
  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /frontend-design/i }),
  ).toBeVisible();
  const skillMarkdownToggle = page.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await expect(skillMarkdownToggle).toBeVisible();
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "false");
  await skillMarkdownToggle.click();
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByTestId("project-chat-skill-markdown-view-rendered"),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-skill-markdown-view-raw"),
  ).toBeVisible();
  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-rendered",
  );
  await expect(page.getByLabel("Skill Markdown Content")).toHaveCount(0);
  await clickSkillMarkdownViewToggle(page, "project-chat-skill-markdown-view-raw");
  await expect(
    page.getByTestId("project-chat-skills-resize-handle"),
  ).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Create dense dashboard layouts.",
  );
  await expect(
    page.getByTestId("project-chat-custom-skill-relative-path-input"),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-custom-skill-create"),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-custom-skill-save"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem(
          "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen",
        ),
      ),
    )
    .toBe("true");
  await expect(
    page.getByRole("button", { name: /Copy path for Workspace skills/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Reveal path for Workspace skills/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Filter MCP tools")).toHaveCount(0);
  await expect(page.getByText("Viewer only:")).toHaveCount(0);
  await expect(page.getByText("MCP tools discovered:")).toHaveCount(0);
  await expect(page.getByText("MCP servers configured:")).toHaveCount(0);
  await expect(page.getByTestId("project-chat-mcp-content")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-slash-tab")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-slash-command")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-slash-list-pane")).toHaveCount(0);
  await page.getByTestId("project-chat-aux-tab-mcp").click();
  await expect(page.getByTestId("project-chat-mcp-content")).toBeVisible();
  await expect(page.getByTestId("project-chat-aux-tab-mcp")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByTestId("project-chat-aux-tab-ai-settings").click();
  await expect(
    page.getByTestId("project-ai-settings-scroll-region"),
  ).toBeVisible();
  await expect(page.getByTestId("project-chat-aux-tabs")).toBeVisible();
  await expect(
    page.getByTestId("project-chat-aux-tab-ai-settings"),
  ).toHaveAttribute("aria-current", "page");
  await page.getByTestId("project-chat-aux-tab-skills").click();
  await expect(page.getByTestId("project-chat-skills-content")).toBeVisible();

  await closeSkillsMcpViewer(page);
  await expect(page.getByTestId("project-chat-skills-view")).toHaveCount(0);
});

test("project ai chat disables save for non-editable custom skills", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_agents_skills::locked-skill",
            name: "locked-skill",
            rootLabel: "Workspace .agents/skills",
            rootPath: "/workspace/.agents/skills",
            relativePath: "locked-skill",
            isEditable: false,
            editabilityReason: "Skill directory is not writable.",
            description: "Locked custom skill.",
          },
        ]),
      ),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_agents_skills::locked-skill",
        content: "# locked-skill\n\nLocked custom skill.\n",
        truncated: false,
        originalSizeBytes: 37,
      }),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await openSkillsViewer(page);
    await page
      .getByTestId("skills-mcp-skill-name")
      .filter({ hasText: "locked-skill" })
      .click();
    await openRawSkillMarkdown(page);

    const saveButton = page.getByTestId("project-chat-custom-skill-save");
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute(
      "title",
      "Skill directory is not writable.",
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat can open slash commands in a dedicated side view", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::placeholder",
        content: "# Placeholder",
      }),
    });
  });

  await ensureAppReady(page);

  await openSlashCommandsViewer(page);

  await expect(
    page.getByTestId("project-chat-slash-commands-view"),
  ).toBeVisible();
  await expect(
    page.getByTestId("skills-mcp-slash-commands-content"),
  ).toBeVisible();
  await expect(page.getByTestId("project-chat-mcp-content")).toHaveCount(0);
  await expect(page.getByTestId("project-chat-skills-content")).toHaveCount(0);
  await expect(page.getByTestId("project-chat-aux-tabs")).toBeVisible();
  await expect(
    page.getByTestId("project-chat-aux-tab-slash-commands"),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("skills-mcp-slash-tab").first()).toBeVisible();
  const slashCommandRows = page.getByTestId("skills-mcp-slash-command");
  await expect(slashCommandRows.first()).toBeVisible();
  await expect(slashCommandRows).toContainText(["/new", "/resume", "/model"]);
  const slashListPane = page.getByTestId("skills-mcp-slash-list-pane");
  await expect(slashListPane).toBeVisible();
  await expect(slashListPane).toHaveCSS("overflow-y", "auto");
  await expect(slashListPane).toHaveCSS("border-top-width", "0px");
  await expect(page.getByTestId("skills-mcp-slash-resize-handle")).toHaveCount(
    0,
  );
  const customCommandInput = page.getByTestId(
    "project-chat-custom-slash-command-input",
  );
  const customPromptInput = page.getByTestId(
    "project-chat-custom-slash-prompt-input",
  );
  const customAddButton = page.getByTestId("project-chat-custom-slash-add");
  await customCommandInput.fill("/project-status");
  await customPromptInput.fill("Summarize project health and open risks.");
  await expect
    .poll(async () => await customAddButton.isEnabled(), { timeout: 10_000 })
    .toBe(true);
  await customAddButton.click();
  await expect(
    page.getByTestId("project-chat-custom-slash-command").filter({
      hasText: "/project-status",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("setta_data");
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        const byProject =
          parsed?.state?.customProjectChatSlashCommandsByProjectConfigId;
        if (!byProject || typeof byProject !== "object") {
          return null;
        }
        return Object.values(byProject)
          .flatMap((value) => (Array.isArray(value) ? value : []))
          .map((entry) => entry.command)
          .filter((entry) => typeof entry === "string");
      }),
    )
    .toContain("/project-status");
  await customCommandInput.fill("/new");
  await customPromptInput.fill("this should collide");
  await expect(customAddButton).toBeDisabled();
  await page
    .getByTestId("project-chat-custom-slash-remove")
    .filter({ hasText: "Remove" })
    .first()
    .click();
  await expect(
    page.getByTestId("project-chat-custom-slash-command").filter({
      hasText: "/project-status",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Agent-native slash commands apply to external agents."),
  ).toBeVisible();

  await closeSkillsMcpViewer(page);
  await expect(
    page.getByTestId("project-chat-slash-commands-view"),
  ).toHaveCount(0);
});

test("project ai chat keeps custom slash commands available without engine configs", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await ensureAppReady(page);
  await openSlashCommandsViewer(page);

  await expect(
    page.getByTestId("project-chat-custom-slash-command-input"),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-custom-slash-prompt-input"),
  ).toBeVisible();
  await expect(page.getByText("No engines configured.")).toBeVisible();
  await expect(page.getByTestId("skills-mcp-slash-tab")).toHaveCount(0);

  await page
    .getByTestId("project-chat-custom-slash-command-input")
    .fill("/project-status");
  await page
    .getByTestId("project-chat-custom-slash-prompt-input")
    .fill("Summarize project health.");
  await page.getByTestId("project-chat-custom-slash-add").click();

  await expect(
    page.getByTestId("project-chat-custom-slash-command").filter({
      hasText: "/project-status",
    }),
  ).toBeVisible();
});

test("project ai chat skills view does not fetch MCP runtime status while hidden", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await ensureAppReady(page);

  let skillsRequests = 0;
  let mcpRequests = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    mcpRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "",
        activeSettaFilesLocation: "local",
        servers: [],
        externalServers: [],
      }),
    });
  });

  await openSkillsViewer(page);
  await expect(page.getByTestId("project-chat-skills-view")).toBeVisible();
  await expect.poll(() => skillsRequests).toBe(1);
  expect(mcpRequests).toBe(0);
});

test("project ai chat only fetches agent runs for slash commands", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let getAgentRunsRequests = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "",
        activeSettaFilesLocation: "local",
        servers: [],
        externalServers: [],
      }),
    });
  });

  await ensureAppReady(page);
  await page.waitForTimeout(1200);
  const baselineRequestCount = getAgentRunsRequests;
  await openSkillsViewer(page);
  await expect(page.getByTestId("project-chat-skills-view")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(getAgentRunsRequests).toBe(baselineRequestCount);

  await page.getByTestId("project-chat-aux-tab-mcp").click();
  await expect(page.getByTestId("project-chat-mcp-content")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(getAgentRunsRequests).toBe(baselineRequestCount);

  await page.getByTestId("project-chat-aux-tab-slash-commands").click();
  await expect(page.getByTestId("skills-mcp-slash-tab").first()).toBeVisible();
  await expect
    .poll(() => getAgentRunsRequests, { timeout: 15000 })
    .toBeGreaterThan(baselineRequestCount);
});

test("project ai chat ignores stale native slash local storage from other projects", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 2500);
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    expect(engineConfigsResponse.ok()).toBe(true);
    const engineConfigs = (await engineConfigsResponse.json()) as Array<{
      id: string;
      name: string;
      engineType: string;
    }>;
    const externalEngine = engineConfigs.find(
      (engine) => engine.engineType === "external_agent",
    );
    if (!externalEngine) {
      throw new Error(
        "Missing external agent engine for slash-command local-storage test.",
      );
    }

    await page.evaluate(
      ({ externalEngineId }) => {
        window.localStorage.setItem(
          "setta.projectChatSkillsMcpViewer.agentNativeSlashCommandsByProjectConfigId",
          JSON.stringify({
            "project-other": {
              [externalEngineId]: {
                commands: ["/ship"],
                status: "available",
                statusDetail: null,
              },
            },
          }),
        );
      },
      {
        externalEngineId: externalEngine.id,
      },
    );
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    await openSlashCommandsViewer(page);
    const externalEngineTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(externalEngineTab).toBeVisible();
    await externalEngineTab.click();

    const customCommandInput = page.getByTestId(
      "project-chat-custom-slash-command-input",
    );
    const customPromptInput = page.getByTestId(
      "project-chat-custom-slash-prompt-input",
    );
    const customAddButton = page.getByTestId("project-chat-custom-slash-add");

    await customCommandInput.fill("/ship");
    await customPromptInput.fill("Summarize project health.");
    await expect
      .poll(async () => await customAddButton.isEnabled(), { timeout: 10_000 })
      .toBe(true);
    await customAddButton.click();
    await expect(
      page.getByTestId("project-chat-custom-slash-command").filter({
        hasText: "/ship",
      }),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat keeps native slash commands unavailable after terminal run-load failure", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  allowExpectedApiError(page, {
    path: "/api/getAgentRuns",
    statuses: [500],
    method: "GET",
    count: 12,
    ttlMs: 20_000,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  let getAgentRunsRequests = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "forced failure" }),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    expect(engineConfigsResponse.ok()).toBe(true);
    const engineConfigs = (await engineConfigsResponse.json()) as Array<{
      id: string;
      name: string;
      engineType: string;
    }>;
    const externalEngine = engineConfigs.find(
      (engine) => engine.engineType === "external_agent",
    );
    if (!externalEngine) {
      throw new Error(
        "Missing external agent engine for slash-command terminal failure test.",
      );
    }

    await openSlashCommandsViewer(page);
    const externalEngineTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(externalEngineTab).toBeVisible();
    await externalEngineTab.click();

    const deployCommand = page
      .getByTestId("skills-mcp-agent-slash-command")
      .filter({ hasText: "/deploy" });
    await expect(deployCommand).toHaveCount(0);
    await expect(
      page.getByText(
        "Native command metadata is unavailable until agent metadata reloads for this project.",
      ),
    ).toBeVisible();

    await expect
      .poll(() => getAgentRunsRequests, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(4);
    await expect(deployCommand).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat blocks custom slash creation until native command authority is ready", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    expect(engineConfigsResponse.ok()).toBe(true);
    const engineConfigs = (await engineConfigsResponse.json()) as Array<{
      id: string;
      name: string;
      engineType: string;
    }>;
    const externalEngine = engineConfigs.find(
      (engine) => engine.engineType === "external_agent",
    );
    if (!externalEngine) {
      throw new Error(
        "Missing external agent engine for slash-command authority test.",
      );
    }

    await page.route("**/api/getAgentRuns", async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 2500);
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-native-commands",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-02T00:00:00Z",
            finishedAt: "2026-02-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "external_agent",
              projectConfigId: projectContext.projectConfigId,
              chatId: "native-chat",
              engineConfigId: externalEngine.id,
              messages: [],
            },
            outputs: {
              metadata: {
                engineConfigId: externalEngine.id,
                agentNativeSlashCommands: ["/deploy"],
              },
            },
          },
        ]),
      });
    });
    await seedAIStore(page, {
      agentRunsAuthorityState: "terminal_error",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: "Failed to load agent runs",
    });
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    await openSlashCommandsViewer(page);
    const externalEngineTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(externalEngineTab).toBeVisible();
    await externalEngineTab.click();

    await page
      .getByTestId("project-chat-custom-slash-command-input")
      .fill("/deploy");
    await page
      .getByTestId("project-chat-custom-slash-prompt-input")
      .fill("Deploy the current build.");

    await expect(
      page.getByText(
        "Command names stay disabled until native command authority is loaded for this project.",
      ),
    ).toBeVisible();
    const addButton = page.getByTestId("project-chat-custom-slash-add");
    await expect(addButton).toBeDisabled();

    await expect
      .poll(async () => await addButton.isDisabled(), { timeout: 10_000 })
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat reloads unresolved native slash commands once authority becomes ready", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const engineConfigsResponse = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(engineConfigsResponse.ok()).toBe(true);
  const engineConfigs = (await engineConfigsResponse.json()) as Array<{
    id: string;
    name: string;
    engineType: string;
    externalAgentConfigId?: string | null;
  }>;
  const externalEngine = engineConfigs.find(
    (engine) => engine.engineType === "external_agent",
  );
  if (!externalEngine) {
    throw new Error(
      "Missing external agent engine for cached native slash submit test.",
    );
  }
  if (!externalEngine.externalAgentConfigId) {
    throw new Error(
      "Missing external agent config id for cached native slash submit test.",
    );
  }

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: externalEngine.externalAgentConfigId,
          name: externalEngine.name,
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          nodePath: null,
          nodeVersion: null,
          sdkVersion: null,
          cliVersion: "0.0.0",
          baseUrl: null,
          workingDir: null,
          envVars: {
            present: [],
            missing: [],
          },
        },
      ]),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    let releaseAgentRuns: (() => void) | null = null;
    const agentRunsGate = new Promise<void>((resolve) => {
      releaseAgentRuns = resolve;
    });
    let getAgentRunsRequests = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequests += 1;
      await agentRunsGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-native-commands",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-02T00:00:00Z",
            finishedAt: "2026-02-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "external_agent",
              projectConfigId: projectContext.projectConfigId,
              chatId: "native-chat",
              engineConfigId: externalEngine.id,
              messages: [],
            },
            outputs: {
              metadata: {
                engineConfigId: externalEngine.id,
                agentNativeSlashCommands: ["/deploy"],
              },
            },
          },
        ]),
      });
    });

    let llmResponseRequests = 0;
    let submittedMessageText: string | null = null;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmResponseRequests += 1;
      const payload = route.request().postDataJSON() as {
        message?: {
          content?: Array<{
            text?: string;
          }>;
        };
      };
      submittedMessageText = payload.message?.content?.[0]?.text ?? null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("native-chat"),
      });
    });
    await page.route("**/api/getExternalAgentChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          toolCallArguments: {},
          contextUsage: null,
        }),
      });
    });

    await seedAIStore(page, {
      agentRunsAuthorityState: "terminal_error",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: "Failed to load agent runs",
      projectChatSelectedEngineId: externalEngine.id,
    });

    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const input = page.getByTestId("chat-input-textarea");
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
    await input.fill("/deploy now");
    await page.getByLabel("Send message").click();

    await expect
      .poll(() => getAgentRunsRequests, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    expect(llmResponseRequests).toBe(0);
    await expect(input).toHaveValue("/deploy now");

    releaseAgentRuns?.();

    await expect.poll(() => llmResponseRequests, { timeout: 10_000 }).toBe(1);
    expect(submittedMessageText).toBe("/deploy now");
    await expect(page.getByText("Submitted /deploy")).toBeVisible();
    await expect(input).toHaveValue("");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat retries slash-command authority for mixed-engine projects without switching tabs", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const engineConfigsResponse = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(engineConfigsResponse.ok()).toBe(true);
  const actualEngineConfigs = (await engineConfigsResponse.json()) as Array<{
    id: string;
    name: string;
    engineType: string;
    externalAgentConfigId?: string | null;
    settaLlmConfigId?: string | null;
  }>;
  const llmEngine = actualEngineConfigs.find(
    (engine) => engine.engineType === "setta_llm",
  );
  const externalEngine = actualEngineConfigs.find(
    (engine) => engine.engineType === "external_agent",
  );
  if (!llmEngine || !externalEngine) {
    throw new Error(
      "Missing mixed engine coverage for slash-command authority retry test.",
    );
  }
  const sortedEngineConfigs = [
    llmEngine,
    externalEngine,
    ...actualEngineConfigs.filter(
      (engine) => engine.id !== llmEngine.id && engine.id !== externalEngine.id,
    ),
  ];

  allowExpectedApiError(page, {
    path: "/api/getAgentRuns",
    statuses: [500],
    method: "GET",
    count: 1,
    ttlMs: 20_000,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sortedEngineConfigs),
    });
  });
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  let currentProjectConfigId: string | null = null;
  let getAgentRunsRequests = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequests += 1;
    if (getAgentRunsRequests === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "transient failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        currentProjectConfigId
          ? [
              {
                id: "run-native-commands",
                profileId: null,
                status: "completed",
                startedAt: "2026-02-02T00:00:00Z",
                finishedAt: "2026-02-02T00:00:01Z",
                events: [],
                inputs: {
                  runType: "external_agent",
                  projectConfigId: currentProjectConfigId,
                  chatId: "native-chat",
                  engineConfigId: externalEngine.id,
                  messages: [],
                },
                outputs: {
                  metadata: {
                    engineConfigId: externalEngine.id,
                    agentNativeSlashCommands: ["/deploy"],
                  },
                },
              },
            ]
          : [],
      ),
    });
  });

  await ensureAppReady(page);
  await seedAIStore(page, {
    agentRunsAuthorityState: "terminal_error",
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: "Failed to load agent runs",
  });
  await page.reload();
  await page.waitForSelector(".react-flow__pane");

  const projectContext = await openIsolatedProject(page);
  currentProjectConfigId = projectContext.projectConfigId;

  try {
    await openSlashCommandsViewer(page);

    const llmTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: llmEngine.name })
      .first();
    const externalTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(llmTab).toBeVisible();
    await expect(externalTab).toBeVisible();
    await expect(llmTab).toHaveClass(/bg-blue-50/);
    await expect(externalTab).not.toHaveClass(/bg-blue-50/);

    const commandInput = page.getByTestId(
      "project-chat-custom-slash-command-input",
    );
    const promptInput = page.getByTestId(
      "project-chat-custom-slash-prompt-input",
    );
    const addButton = page.getByTestId("project-chat-custom-slash-add");

    await commandInput.fill("/project-status");
    await promptInput.fill("Summarize project health.");

    await expect
      .poll(() => getAgentRunsRequests, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => await addButton.isEnabled(), { timeout: 10_000 })
      .toBe(true);
    await expect(llmTab).toHaveClass(/bg-blue-50/);
    await expect(externalTab).not.toHaveClass(/bg-blue-50/);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("custom slash commands preserve attachments on submit", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  await ensureAppReady(page);
  let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
    null;

  try {
    projectContext = await openIsolatedProject(page);
    await openSlashCommandsViewer(page);

    await page
      .getByTestId("project-chat-custom-slash-command-input")
      .fill("/attach-summary");
    await page
      .getByTestId("project-chat-custom-slash-prompt-input")
      .fill("Summarize the attached file.");
    await expect
      .poll(
        async () =>
          await page.getByTestId("project-chat-custom-slash-add").isEnabled(),
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.getByTestId("project-chat-custom-slash-add").click();

    await closeSkillsMcpViewer(page);

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    await projectChatSurface
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("release notes"),
      });
    await expect(page.getByText("notes.txt")).toBeVisible();

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/getLLMResponse"),
    );
    await page
      .getByTestId("chat-input-textarea")
      .fill("/attach-summary first line\n\n  second line");
    await page.getByLabel("Send message").click();

    const request = await requestPromise;
    const payload = request.postDataJSON() as {
      message?: {
        content?: Array<{
          text?: string;
        }>;
        attachments?: Array<{
          name?: string;
        }>;
      };
    };

    expect(payload.message?.content?.[0]?.text).toBe(
      "Summarize the attached file.\n\nfirst line\n\n  second line",
    );
    expect(payload.message?.attachments).toHaveLength(1);
    expect(payload.message?.attachments?.[0]?.name).toBe("notes.txt");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat can open the project ai settings pane from tools", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await ensureAppReady(page);

  await page.getByRole("button", { name: "Project AI Settings" }).click();
  const activityAccordionDefaultRow = page.getByTestId(
    "project-chat-settings-activity-accordion-default",
  );
  const activityChildrenDefaultRow = page.getByTestId(
    "project-chat-settings-activity-children-default",
  );
  await expect(activityAccordionDefaultRow).toBeVisible();
  await expect(activityChildrenDefaultRow).toBeVisible();
  await expect(activityAccordionDefaultRow).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(activityAccordionDefaultRow).toHaveCSS(
    "border-right-width",
    "0px",
  );
  await expect(activityAccordionDefaultRow).toHaveCSS(
    "border-bottom-width",
    "0px",
  );
  await expect(activityAccordionDefaultRow).toHaveCSS(
    "border-left-width",
    "0px",
  );
  await expect(activityChildrenDefaultRow).toHaveCSS("border-top-width", "0px");
  await expect(activityChildrenDefaultRow).toHaveCSS(
    "border-right-width",
    "0px",
  );
  await expect(activityChildrenDefaultRow).toHaveCSS(
    "border-bottom-width",
    "0px",
  );
  await expect(activityChildrenDefaultRow).toHaveCSS(
    "border-left-width",
    "0px",
  );

  await page.getByTestId("project-chat-settings-open-project-settings").click();
  await expect(
    page.getByTestId("project-ai-settings-scroll-region"),
  ).toBeVisible();
  await expect(page.getByTestId("project-chat-aux-tabs")).toBeVisible();
  await expect(
    page.getByTestId("project-chat-aux-tab-ai-settings"),
  ).toHaveAttribute("aria-current", "page");
});

test("project ai chat keeps aux views session-local across stale storage and reloads", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    projectChatAuxViewByProjectConfigId: {
      stale: "skills",
    },
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
            isEditable: false,
            editabilityReason: null,
          },
        ]),
      ),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::ui-layout",
        content: "# UI Layout\n\nCreate dense dashboard layouts.",
      }),
    });
  });

  await ensureAppReady(page);

  await expect(page.getByTestId("project-chat-skills-view")).toHaveCount(0);
  await expect(page.getByTestId("chat-input-textarea")).toBeVisible();

  await openSkillsViewer(page);
  await expect(page.getByTestId("project-chat-skills-view")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
  await expect(page.getByTestId("project-chat-skills-view")).toHaveCount(0);
  await expect(page.getByTestId("chat-input-textarea")).toBeVisible();
});

test("project ai chat keeps unsaved raw skill edits during same-skill refresh", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillContentRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "user_agents_skills::triage",
            name: "triage",
            rootLabel: "User ~/.codex/skills",
            rootPath: "/home/.codex/skills",
            relativePath: "triage",
            description: "Triage open issues.",
            isEditable: true,
            editabilityReason: null,
          },
        ]),
      ),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    skillContentRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "user_agents_skills::triage",
        content:
          skillContentRequestCount === 1
            ? "# Triage\n\nOriginal server copy."
            : "# Triage\n\nRefreshed server copy.",
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  const editor = page.getByLabel("Skill Markdown Content");
  const editorContent = editor.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.insertText("# Triage\n\nUnsaved local draft.");
  await expect(editorContent).toContainText("Unsaved local draft.");

  await page.getByTestId("project-chat-skills-refresh").click();
  await expect.poll(() => skillContentRequestCount).toBe(2);
  await expect(editorContent).toContainText("Unsaved local draft.");
  await expect(editorContent).not.toContainText("Refreshed server copy.");
});

test("project ai chat keeps MCP runtime statuses distinct across matching server ids", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::placeholder",
        content: "# Placeholder",
      }),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          "shared-server": {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["shared-server"],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "/workspace/setta_files/llm_config.json",
        activeSettaFilesLocation: "local",
        servers: [
          {
            serverId: "shared-server",
            source: "setta_mcp",
            transport: "sse",
            endpoint: "http://127.0.0.1:8000/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 4,
          },
        ],
        externalServers: [
          {
            serverId: "shared-server",
            source: "external_runtime",
            transport: "sse",
            endpoint: "https://external.example.dev/mcp",
            state: "error",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 1,
            lastError: "authorization failed",
            missingEnvVar: null,
            toolCount: 0,
          },
        ],
      }),
    });
  });

  await ensureAppReady(page);
  await openMcpViewer(page);
  await expect(page.getByTestId("project-chat-mcp-view")).toBeVisible();

  const serverRows = page.getByTestId("skills-mcp-server-id");
  await expect(serverRows).toHaveCount(2);
  await expect(page.getByText("Active external runtime")).toBeVisible();
  const quickInfos = await serverRows.evaluateAll((nodes) => {
    return nodes.map((node) => {
      const statusDot = node.previousElementSibling as HTMLElement | null;
      return statusDot?.getAttribute("aria-label") ?? "";
    });
  });
  expect(quickInfos).toContain("Connected: 4 tools");
  expect(quickInfos).toContain("Error: authorization failed | 0 tools");
});

test("project ai chat shows custom setta_files label from runtime status endpoint", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::placeholder",
        content: "# Placeholder",
      }),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "/tmp/workspace/setta_files_dev/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "sse",
            endpoint: "http://127.0.0.1:8000/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 1,
          },
        ],
        externalServers: [],
      }),
    });
  });

  await ensureAppReady(page);
  await openMcpViewer(page);
  await expect(page.getByTestId("project-chat-mcp-view")).toBeVisible();

  await expect(page.getByText("Active custom setta_files root")).toBeVisible();
});

test("mcp view keeps threads visible when threads are open", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1200,
    overviewTrueWidth: 1200,
    viewThreads: true,
  });
  await ensureAppReady(page);
  await page.getByTestId("project-chat-window-maximize").first().click();
  await expect(page.getByTestId("project-chat-maximized-window").first()).toBeVisible();

  const overviewPane = await getVisibleProjectChatSurface(page);
  const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
  await expect(threadsPanel).toBeVisible();

  await openMcpViewer(page);
  await expect(threadsPanel).toBeVisible();
  const mcpPane = page.getByTestId("project-chat-mcp-content");
  await expect(mcpPane).toBeVisible();
  const shellInfo = await mcpPane.evaluate((element) => {
    const shell = element.closest('[data-chat-width-shell="true"]');
    if (!(shell instanceof HTMLElement)) {
      return null;
    }
    const style = window.getComputedStyle(shell);
    return {
      maxWidth: style.maxWidth,
      width: shell.getBoundingClientRect().width,
    };
  });
  expect(shellInfo).not.toBeNull();
  expect(shellInfo?.maxWidth).toBe("1152px");
  expect(shellInfo?.width).toBeLessThanOrEqual(1152);
});

test("project ai chat truncates long skill and mcp rows in narrow panes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::super-long-ui-layout-skill",
            name: "super-long-ui-layout-skill-name-that-should-be-truncated-in-a-tight-pane-width",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath:
              "nested/deep/path/to/a/super-long-skill-relative-path-that-should-be-truncated-for-readability",
            description: "Exercise truncation behavior for skill labels.",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          "server-id-with-a-very-long-name-that-should-truncate-cleanly-in-the-list":
            {
              transport: "sse",
              url: "https://example.com/very/long/mcp/endpoint/path/that/should-truncate-when-the-pane-is-narrower/and-still-remain-usable",
            },
        },
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await expect(page.getByTestId("project-chat-skills-view")).toBeVisible();

  await expectHasEllipsisTruncation(
    page.getByTestId("skills-mcp-skill-name").first(),
  );
  await expectHasEllipsisTruncation(
    page.getByTestId("skills-mcp-skill-path").first(),
  );
  await closeSkillsMcpViewer(page);

  await openMcpViewer(page);
  await expect(page.getByTestId("project-chat-mcp-view")).toBeVisible();
  await expectHasEllipsisTruncation(
    page.getByTestId("skills-mcp-server-id").first(),
  );
  await expectHasEllipsisTruncation(
    page.getByTestId("skills-mcp-server-endpoint").first(),
  );
});

test("project ai chat shows inline skills endpoint error when routes are missing", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not Found" }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkills",
    statuses: [404],
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await ensureAppReady(page);

  await openSkillsViewer(page);
  await expect(page.getByText("Skills unavailable (Not Found).")).toBeVisible();
});

test("project ai chat shows loading states before skills and mcp data arrive", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/settaHomeInfo", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        settaHome: "/home/test/.setta",
        globalSettaFilesBase: "/home/test/.setta/files",
        activeSettaFilesLocation: "local",
        llmConfigPath: "/workspace/setta_files/llm_config.json",
      }),
    });
  });
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "/workspace/setta_files/llm_config.json",
        activeSettaFilesLocation: "local",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "sse",
            endpoint: "http://127.0.0.1:8000/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 1,
          },
        ],
        externalServers: [],
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_skills::ui-layout",
        content: "# UI Layout\n\nCreate dense dashboard layouts.",
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  await expect(page.getByText("Loading skills...")).toBeVisible();
  await expect(page.getByText("No skills found.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(page.getByText("Loading skills...")).toHaveCount(0);

  await closeSkillsMcpViewer(page);
  await openMcpViewer(page);
  await expect(page.getByText("Loading MCP servers...")).toBeVisible();
  await expect(page.getByText("No MCP servers configured.")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-server-id")).toHaveCount(1);
  await expect(page.getByText("Loading MCP servers...")).toHaveCount(0);
});

test("project ai chat keeps skills list stable during selection and ignores stale markdown responses", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsFetchCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsFetchCount += 1;
    const skills = [
      {
        skillId: "workspace_skills::alpha-skill",
        name: "alpha-skill",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "alpha-skill",
        description: "Alpha skill",
      },
      {
        skillId: "workspace_skills::beta-skill",
        name: "beta-skill",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "beta-skill",
        description: "Beta skill",
      },
      ...Array.from({ length: 203 }, (_, index) => {
        return {
          skillId: `workspace_skills::skill-${index}`,
          name: `skill-${index}`,
          rootLabel: "Workspace skills",
          rootPath: "/workspace/skills",
          relativePath: `skill-${index}`,
          description: `Skill ${index}`,
        };
      }),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse(skills)),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  let skillContentRequestCount = 0;
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    skillContentRequestCount += 1;
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "";
    if (skillId.endsWith("alpha-skill")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content: `# ${skillId}`,
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  await expect(page.getByRole("button", { name: /beta-skill/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /skill-202/i })).toHaveCount(1);
  await page.waitForTimeout(200);
  const fetchCountAfterInitialLoad = skillsFetchCount;
  expect(fetchCountAfterInitialLoad).toBeGreaterThan(0);
  expect(skillContentRequestCount).toBe(0);

  await page.getByRole("button", { name: /beta-skill/i }).click();
  await expect.poll(() => skillsFetchCount).toBe(fetchCountAfterInitialLoad);
  expect(skillContentRequestCount).toBe(0);

  await openRawSkillMarkdown(page);
  await expect.poll(() => skillContentRequestCount).toBe(1);
  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("workspace_skills::beta-skill");
  await page.waitForTimeout(700);
  await expect(markdown).toContainText("workspace_skills::beta-skill");
  await expect(markdown).not.toContainText("workspace_skills::alpha-skill");
});

test("project ai chat clears stale markdown when viewer is collapsed during an in-flight request", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::alpha-skill",
            name: "alpha-skill",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "alpha-skill",
            description: "Alpha skill",
          },
          {
            skillId: "workspace_skills::beta-skill",
            name: "beta-skill",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "beta-skill",
            description: "Beta skill",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "";
    if (skillId.endsWith("alpha-skill")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content: `# ${skillId}`,
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await expect(page.getByRole("button", { name: /beta-skill/i })).toBeVisible();

  const viewerToggle = page.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  await clickSkillMarkdownViewToggle(page, "project-chat-skill-markdown-view-raw");
  await expect(page.getByLabel("Skill Markdown Content")).toBeVisible();
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /beta-skill/i }).click();

  // Allow the stale alpha response to resolve while the viewer is closed.
  await page.waitForTimeout(700);

  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  await clickSkillMarkdownViewToggle(page, "project-chat-skill-markdown-view-raw");
  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toBeVisible();
  const immediateText = (await markdown.textContent()) ?? "";
  expect(immediateText).not.toContain("workspace_skills::alpha-skill");
  await expect(markdown).toContainText("workspace_skills::beta-skill");
  await expect(markdown).not.toContainText("workspace_skills::alpha-skill");
});

test("project ai chat refresh updates selected markdown content without requiring reselection", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  let skillContentVersion = 0;
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    skillContentVersion += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::ui-layout",
        content: `# UI Layout\n\nRevision ${skillContentVersion}`,
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("Revision 1");

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(markdown).toContainText("Revision 2");
});

test("project ai chat keeps existing skills and markdown preview on refresh failure", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (skillsRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildAppGenSkillsResponse([
            {
              skillId: "workspace_skills::ui-layout",
              name: "ui-layout",
              rootLabel: "Workspace skills",
              rootPath: "/workspace/skills",
              relativePath: "ui-layout",
              description: "Create dense dashboard layouts.",
            },
          ]),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Filesystem scan failed." }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkills",
    statuses: [500],
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::ui-layout",
        content: "# UI Layout\n\nStable preview",
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Stable preview",
  );

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(
    page.getByText("Skills unavailable (Filesystem scan failed.)."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Stable preview",
  );
});

test("project ai chat refresh is disabled while loading to prevent redundant scans", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (skillsRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildAppGenSkillsResponse([
            {
              skillId: "workspace_skills::baseline",
              name: "baseline",
              rootLabel: "Workspace skills",
              rootPath: "/workspace/skills",
              relativePath: "baseline",
              description: "Baseline skill",
            },
          ]),
        ),
      });
      return;
    }
    if (skillsRequestCount === 2) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildAppGenSkillsResponse([
            {
              skillId: "workspace_skills::fresh-skill",
              name: "fresh-skill",
              rootLabel: "Workspace skills",
              rootPath: "/workspace/skills",
              relativePath: "fresh-skill",
              description: "Fresh result",
            },
          ]),
        ),
      });
      return;
    }
    throw new Error("Unexpected extra getAppGenSkills request.");
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_skills::baseline",
        content: `# ${(payload.skillId ?? "workspace_skills::baseline").trim()}`,
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await expect(page.getByRole("button", { name: /baseline/i })).toBeVisible();

  const refreshButton = page.getByTestId("project-chat-skills-refresh");
  await refreshButton.click();
  await expect(refreshButton).toBeDisabled();
  await page.waitForTimeout(100);
  expect(skillsRequestCount).toBe(2);
  await expect(
    page.getByRole("button", { name: /fresh-skill/i }),
  ).toBeVisible();
  await expect(refreshButton).toBeEnabled();
  expect(skillsRequestCount).toBe(2);
});

test("project ai chat shows reveal-path failures instead of silently swallowing them", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_skills::ui-layout",
        content: "# UI Layout",
      }),
    });
  });

  await page.route("**/api/revealPathInOsFileExplorer", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Reveal is disabled for this path." }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/revealPathInOsFileExplorer",
    statuses: [400],
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  await page
    .getByRole("button", { name: /Reveal path for Workspace skills/i })
    .click();
  await expect(
    page.getByText("Failed to reveal path: Reveal is disabled for this path."),
  ).toBeVisible();
});

test("project ai chat uses the backend create root for the custom skills root hint", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const createRootPath = "/home/.agents/skills";
  let revealedPath: string | null = null;
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse(
          [
            {
              skillId: "workspace_agents_skills::workspace-only",
              name: "workspace-only",
              rootLabel: "Workspace .agents/skills",
              rootPath: "/workspace/.agents/skills",
              relativePath: "workspace-only",
              isEditable: true,
              editabilityReason: null,
              description: "Workspace custom skill.",
            },
          ],
          {
            customSkillCreateRootPath: createRootPath,
            customSkillCreateRootActionable: false,
          },
        ),
      ),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_agents_skills::workspace-only",
        content: "# workspace-only\n\nWorkspace custom skill.",
        truncated: false,
        originalSizeBytes: 40,
      }),
    });
  });
  await page.route("**/api/revealPathInOsFileExplorer", async (route) => {
    const payload = route.request().postDataJSON() as { path?: string };
    revealedPath = payload.path ?? null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  const rootHint = page.getByTestId("project-chat-custom-skill-root-path");
  await expect(rootHint).toContainText(createRootPath);
  await expect(rootHint).toContainText("not created yet");
  await expect(rootHint).not.toContainText("/workspace/.agents/skills");
  await expect(
    page.getByTestId("project-chat-custom-skill-root-reveal"),
  ).toBeDisabled();
  expect(revealedPath).toBeNull();
});

test("project ai chat disables custom skill creation when the backend has no current create root", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([], {
          customSkillCreateRootPath: null,
          customSkillCreateRootActionable: false,
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  await page
    .getByTestId("project-chat-custom-skill-relative-path-input")
    .fill("new-custom-skill");
  await expect(
    page.getByTestId("project-chat-custom-skill-create"),
  ).toBeDisabled();
  await expect(
    page.getByTestId("project-chat-custom-skill-root-path"),
  ).toContainText("Custom skills root unavailable.");
});

test("project ai chat clears stale custom skill root actions after a refresh failure", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  let skillsRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (skillsRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildAppGenSkillsResponse([], {
            customSkillCreateRootPath: rootPath,
            customSkillCreateRootActionable: true,
          }),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "forced refresh failure" }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkills",
    statuses: [500],
    ttlMs: 20_000,
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  await page
    .getByTestId("project-chat-custom-skill-relative-path-input")
    .fill("new-custom-skill");
  await expect(
    page.getByTestId("project-chat-custom-skill-create"),
  ).toBeEnabled();
  await expect(
    page.getByTestId("project-chat-custom-skill-root-reveal"),
  ).toBeEnabled();

  await page.getByTestId("project-chat-skills-refresh").click();

  await expect(
    page.getByText("Skills unavailable (forced refresh failure)."),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-custom-skill-root-path"),
  ).toContainText("Custom skills root unavailable.");
  await expect(
    page.getByTestId("project-chat-custom-skill-root-reveal"),
  ).toBeDisabled();
  await expect(
    page.getByTestId("project-chat-custom-skill-create"),
  ).toBeDisabled();
});

test("project ai chat keeps created custom skills usable without follow-up reads", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  let skillsRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (skillsRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildAppGenSkillsResponse([], {
            customSkillCreateRootPath: rootPath,
            customSkillCreateRootActionable: true,
          }),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "forced skills refresh failure" }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkills",
    statuses: [500],
    ttlMs: 20_000,
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  let skillContentRequestCount = 0;
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    skillContentRequestCount += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "forced content fetch failure",
      }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkillContent",
    statuses: [404],
    ttlMs: 20_000,
  });

  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    const payload = route.request().postDataJSON() as {
      relativePath?: string | null;
      content?: string;
    };
    const relativePath = payload.relativePath ?? "created-skill";
    const skillId = `user_agents_skills::${relativePath}`;
    const content = payload.content ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId,
          created: true,
          rootPath,
          rootLabel: "User ~/.agents/skills",
          relativePath,
          content,
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await page
    .getByTestId("project-chat-custom-skill-relative-path-input")
    .fill("created-skill");
  await page.getByTestId("project-chat-custom-skill-create").click();

  await expect(
    page.getByText("Created custom skill created-skill."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /created-skill/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "# created-skill",
  );
  await expect(
    page.getByTestId("project-chat-custom-skill-save"),
  ).toBeEnabled();
  expect(skillsRequestCount).toBe(1);
  expect(skillContentRequestCount).toBe(0);
});

test("project ai chat can create and save custom skills from raw markdown mode", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  const skills: Array<{
    skillId: string;
    name: string;
    rootLabel: string;
    rootPath: string;
    relativePath: string;
    isEditable: boolean;
    editabilityReason: string | null;
    description: string;
  }> = [
    {
      skillId: "user_agents_skills::custom-one",
      name: "custom-one",
      rootLabel: "User ~/.agents/skills",
      rootPath,
      relativePath: "custom-one",
      isEditable: true,
      editabilityReason: null,
      description: "Custom skill",
    },
  ];
  const contentBySkillId: Record<string, string> = {
    "user_agents_skills::custom-one": "# custom-one\n\nInitial body",
  };
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse(skills, {
          customSkillCreateRootPath: rootPath,
          customSkillCreateRootActionable: true,
        }),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "user_agents_skills::custom-one";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content: contentBySkillId[skillId] ?? "# unknown",
        truncated: false,
        originalSizeBytes: (contentBySkillId[skillId] ?? "# unknown").length,
      }),
    });
  });

  const upsertPayloads: Array<{
    skillId: string | null;
    relativePath: string | null;
    content: string;
  }> = [];
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    const payload = route.request().postDataJSON() as {
      skillId?: string | null;
      relativePath?: string | null;
      content?: string;
    };
    const skillId = payload.skillId ?? null;
    const relativePath = payload.relativePath ?? null;
    const content = payload.content ?? "";
    upsertPayloads.push({
      skillId,
      relativePath,
      content,
    });
    if (skillId) {
      contentBySkillId[skillId] = content;
      const skillDirName = skillId.split("::")[1] ?? "custom-one";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildUpsertAppGenCustomSkillResponse({
            skillId,
            created: false,
            rootPath,
            rootLabel: "User ~/.agents/skills",
            relativePath: skillDirName,
            content,
            description: "Custom skill",
          }),
        ),
      });
      return;
    }
    const nextRelativePath = relativePath ?? "new-custom-skill";
    const createdSkillId = `user_agents_skills::${nextRelativePath}`;
    contentBySkillId[createdSkillId] = content;
    skills.push({
      skillId: createdSkillId,
      name: nextRelativePath,
      rootLabel: "User ~/.agents/skills",
      rootPath,
      relativePath: nextRelativePath,
      isEditable: true,
      editabilityReason: null,
      description: "",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId: createdSkillId,
          created: true,
          rootPath,
          rootLabel: "User ~/.agents/skills",
          relativePath: nextRelativePath,
          content,
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await page.getByTestId("project-chat-custom-skill-save").click();
  await expect.poll(() => upsertPayloads.length).toBe(1);
  expect(upsertPayloads[0]).toMatchObject({
    skillId: "user_agents_skills::custom-one",
    relativePath: null,
  });

  await page
    .getByTestId("project-chat-custom-skill-relative-path-input")
    .fill("new-custom-skill");
  await page.getByTestId("project-chat-custom-skill-create").click();
  await expect.poll(() => upsertPayloads.length).toBe(2);
  expect(upsertPayloads[1]).toMatchObject({
    skillId: null,
    relativePath: "new-custom-skill",
  });
  await expect(
    page.getByRole("button", { name: /new-custom-skill/i }),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-custom-skill-root-path"),
  ).toContainText(rootPath);
  await expect(
    page.getByTestId("project-chat-custom-skill-root-reveal"),
  ).toBeEnabled();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "# new-custom-skill",
  );
});

test("project ai chat renders unsaved raw markdown edits before save", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "user_agents_skills::custom-one",
            name: "custom-one",
            rootLabel: "User ~/.agents/skills",
            rootPath,
            relativePath: "custom-one",
            isEditable: true,
            editabilityReason: null,
            description: "Custom skill",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "user_agents_skills::custom-one",
        content: "# custom-one\n\nOriginal body",
        truncated: false,
        originalSizeBytes: "# custom-one\n\nOriginal body".length,
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);

  await page.getByRole("button", { name: "Skill Markdown Viewer" }).click();
  await clickSkillMarkdownViewToggle(page, "project-chat-skill-markdown-view-raw");

  const markdown = page.getByLabel("Skill Markdown Content");
  const editorContent = markdown.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type("# custom-one\n\nUpdated draft from raw mode");

  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-rendered",
  );
  await expect(page.getByText("Updated draft from raw mode")).toBeVisible();
  await expect(page.getByText("Original body")).toHaveCount(0);

  await clickSkillMarkdownViewToggle(page, "project-chat-skill-markdown-view-raw");
  await expect(
    page.getByTestId("project-chat-custom-skill-save"),
  ).toBeEnabled();
  await expect(markdown).toContainText("Updated draft from raw mode");
});

test("project ai chat create custom skill rejects collisions without overwriting selected skill content", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  const skills = [
    {
      skillId: "user_agents_skills::existing",
      name: "existing",
      rootLabel: "User ~/.agents/skills",
      rootPath,
      relativePath: "existing",
      isEditable: true,
      editabilityReason: null,
      description: "Existing custom skill",
    },
  ];
  const contentBySkillId: Record<string, string> = {
    "user_agents_skills::existing": "# existing\n\nOriginal body",
  };
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse(skills, {
          customSkillCreateRootPath: rootPath,
          customSkillCreateRootActionable: true,
        }),
      ),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "user_agents_skills::existing";
    const content = contentBySkillId[skillId] ?? "# unknown";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content,
        truncated: false,
        originalSizeBytes: content.length,
      }),
    });
  });

  const upsertPayloads: Array<{
    skillId: string | null;
    relativePath: string | null;
  }> = [];
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    const payload = route.request().postDataJSON() as {
      skillId?: string | null;
      relativePath?: string | null;
    };
    upsertPayloads.push({
      skillId: payload.skillId ?? null,
      relativePath: payload.relativePath ?? null,
    });
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Custom skill already exists for relativePath 'existing'.",
      }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/upsertAppGenCustomSkill",
    statuses: [400],
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("Original body");
  await page
    .getByTestId("project-chat-custom-skill-relative-path-input")
    .fill("existing");
  await page.getByTestId("project-chat-custom-skill-create").click();

  await expect.poll(() => upsertPayloads.length).toBe(1);
  expect(upsertPayloads[0]).toEqual({
    skillId: null,
    relativePath: "existing",
  });
  await expect(
    page.getByText(
      "Failed to create custom skill: Custom skill already exists for relativePath 'existing'.",
    ),
  ).toBeVisible();
  await expect(markdown).toContainText("Original body");
});

test("project ai chat keeps selected skill content stable when another skill save resolves", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  const skills = [
    {
      skillId: "user_agents_skills::alpha-custom",
      name: "alpha-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath,
      relativePath: "alpha-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Alpha custom skill",
    },
    {
      skillId: "user_agents_skills::beta-custom",
      name: "beta-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath,
      relativePath: "beta-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Beta custom skill",
    },
  ];
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse(skills)),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  const contentBySkillId: Record<string, string> = {
    "user_agents_skills::alpha-custom": "# alpha-custom\n\nAlpha initial body",
    "user_agents_skills::beta-custom": "# beta-custom\n\nBeta stable body",
  };
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "user_agents_skills::alpha-custom";
    const content = contentBySkillId[skillId] ?? "# unknown";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content,
        truncated: false,
        originalSizeBytes: content.length,
      }),
    });
  });

  let alphaSaveRequestCount = 0;
  let releaseAlphaSave: (() => void) | null = null;
  const alphaSaveBlock = new Promise<void>((resolve) => {
    releaseAlphaSave = resolve;
  });
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    const payload = route.request().postDataJSON() as {
      skillId?: string | null;
      content?: string;
    };
    if (payload.skillId === "user_agents_skills::alpha-custom") {
      alphaSaveRequestCount += 1;
      await alphaSaveBlock;
      contentBySkillId["user_agents_skills::alpha-custom"] =
        payload.content ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildUpsertAppGenCustomSkillResponse({
            skillId: "user_agents_skills::alpha-custom",
            created: false,
            rootPath,
            rootLabel: "User ~/.agents/skills",
            relativePath: "alpha-custom",
            content: payload.content ?? "",
            description: "Alpha custom skill",
          }),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId: payload.skillId ?? "user_agents_skills::beta-custom",
          created: false,
          rootPath,
          rootLabel: "User ~/.agents/skills",
          relativePath: "beta-custom",
          content:
            payload.content ??
            contentBySkillId["user_agents_skills::beta-custom"] ??
            "",
          description: "Beta custom skill",
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  const markdown = page.getByLabel("Skill Markdown Content");
  const betaSkillRow = page.getByRole("button", { name: /beta-custom/i });
  await expect(markdown).toContainText("Alpha initial body");

  const editorContent = markdown.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type("# alpha-custom\n\nAlpha saved update");
  await page.getByTestId("project-chat-custom-skill-save").click();

  await expect.poll(() => alphaSaveRequestCount).toBe(1);
  await betaSkillRow.click();
  await expect(markdown).toContainText("Beta stable body");
  await expect(betaSkillRow).toHaveAttribute("data-selected", "true");

  releaseAlphaSave?.();
  await expect(page.getByText("Saved custom skill.")).toBeVisible();
  await expect(markdown).toContainText("Beta stable body");
  await expect(markdown).not.toContainText("Alpha saved update");
  await expect(betaSkillRow).toHaveAttribute("data-selected", "true");
});

test("project ai chat blocks saving truncated editable skill previews", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "user_agents_skills::large-custom",
            name: "large-custom",
            rootLabel: "User ~/.agents/skills",
            rootPath: "/home/.agents/skills",
            relativePath: "large-custom",
            isEditable: true,
            editabilityReason: null,
            description: "Large editable custom skill.",
          },
        ]),
      ),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "user_agents_skills::large-custom",
        content: "# large-custom\n\nPreview body",
        truncated: true,
        originalSizeBytes: 900000,
      }),
    });
  });

  let upsertRequestCount = 0;
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    upsertRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId: "user_agents_skills::large-custom",
          created: false,
          rootPath: "/home/.agents/skills",
          rootLabel: "User ~/.agents/skills",
          relativePath: "large-custom",
          content: "# large-custom\n\nPreview body",
          description: "Large editable custom skill.",
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await expect(
    page.getByTestId("project-chat-custom-skill-save"),
  ).toBeDisabled();
  await expect(
    page.getByText("Preview is truncated. Full content loading is required"),
  ).toBeVisible();
  expect(upsertRequestCount).toBe(0);
});

test("project ai chat disables save when skill content fetch fails", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "user_agents_skills::broken-custom",
            name: "broken-custom",
            rootLabel: "User ~/.agents/skills",
            rootPath: "/home/.agents/skills",
            relativePath: "broken-custom",
            isEditable: true,
            editabilityReason: null,
            description: "Custom skill with failed fetch.",
          },
        ]),
      ),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Missing SKILL.md for user_agents_skills::broken-custom",
      }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkillContent",
    statuses: [404],
  });

  let upsertRequestCount = 0;
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    upsertRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId: "user_agents_skills::broken-custom",
          created: false,
          rootPath: "/home/.agents/skills",
          rootLabel: "User ~/.agents/skills",
          relativePath: "broken-custom",
          content: "# broken-custom\n\nRecovered body",
          description: "Custom skill with failed fetch.",
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await expect(
    page.getByTestId("project-chat-custom-skill-save"),
  ).toBeDisabled();
  await expect(
    page.getByTestId("project-chat-skill-content-error"),
  ).toContainText("Missing SKILL.md for user_agents_skills::broken-custom");
  expect(upsertRequestCount).toBe(0);
});

test("project ai chat keeps root-level custom skills read-only from backend editability flags", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "user_agents_skills::.",
            name: "skills",
            rootLabel: "User ~/.agents/skills",
            rootPath: "/home/.agents/skills",
            relativePath: ".",
            isEditable: false,
            editabilityReason: "Editing root-level SKILL.md is not supported.",
            description: "Root-level skill doc.",
          },
        ]),
      ),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "user_agents_skills::.",
        content: "# Root skill\n\nRead-only content",
        truncated: false,
        originalSizeBytes: 30,
      }),
    });
  });

  let upsertRequestCount = 0;
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    upsertRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId: "user_agents_skills::.",
          created: false,
          rootPath: "/home/.agents/skills",
          rootLabel: "User ~/.agents/skills",
          relativePath: ".",
          content: "# Root skill\n\nRead-only content",
          isEditable: false,
          editabilityReason: "Editing root-level SKILL.md is not supported.",
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await expect(
    page.getByTestId("project-chat-custom-skill-save"),
  ).toBeDisabled();
  await expect(
    page.getByText("Editing root-level SKILL.md is not supported."),
  ).toBeVisible();
  expect(upsertRequestCount).toBe(0);
});

test("project ai chat can save intentionally empty custom skill content", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  const rootPath = "/home/.agents/skills";
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "user_agents_skills::emptyable",
            name: "emptyable",
            rootLabel: "User ~/.agents/skills",
            rootPath,
            relativePath: "emptyable",
            isEditable: true,
            editabilityReason: null,
            description: "Custom skill that can be emptied.",
          },
        ]),
      ),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "user_agents_skills::emptyable",
        content: "# emptyable\n\nInitial body",
        truncated: false,
        originalSizeBytes: 24,
      }),
    });
  });

  const upsertPayloads: Array<{ content: string }> = [];
  await page.route("**/api/upsertAppGenCustomSkill", async (route) => {
    const payload = route.request().postDataJSON() as { content?: string };
    upsertPayloads.push({ content: payload.content ?? "" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildUpsertAppGenCustomSkillResponse({
          skillId: "user_agents_skills::emptyable",
          created: false,
          rootPath,
          rootLabel: "User ~/.agents/skills",
          relativePath: "emptyable",
          content: payload.content ?? "",
          description: "Custom skill that can be emptied.",
        }),
      ),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  const editor = page.getByLabel("Skill Markdown Content");
  const editorContent = editor.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.press("Backspace");
  await page.getByTestId("project-chat-custom-skill-save").click();

  await expect.poll(() => upsertPayloads.length).toBe(1);
  expect(upsertPayloads[0]?.content).toBe("");
  await expect
    .poll(async () => {
      return editorContent.evaluate((node) => {
        const element = node as HTMLElement;
        return element.innerText.trim();
      });
    })
    .toBe("");
});

test("project ai chat mounts markdown viewer lazily and shows truncation metadata", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildAppGenSkillsResponse([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
        ]),
      ),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "",
        activeSettaFilesLocation: "local",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "sse",
            endpoint: "http://127.0.0.1:8000/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 1,
          },
        ],
        externalServers: [],
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_skills::ui-layout",
        content: "# UI Layout\n\nPreview body",
        truncated: true,
        originalSizeBytes: 900000,
      }),
    });
  });

  await ensureAppReady(page);
  await openMcpViewer(page);
  await expect(page.getByText("Unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Reveal path for Active .*setta_files/i,
    }),
  ).toBeDisabled();

  await closeSkillsMcpViewer(page);
  await openSkillsViewer(page);

  const skillMarkdownToggle = page.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Skill Markdown Content")).toHaveCount(0);

  await skillMarkdownToggle.click();
  await clickSkillMarkdownViewToggle(page, "project-chat-skill-markdown-view-raw");

  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Preview body",
  );
  await expect(
    page.getByText("Preview truncated from 900,000 bytes."),
  ).toBeVisible();
});
