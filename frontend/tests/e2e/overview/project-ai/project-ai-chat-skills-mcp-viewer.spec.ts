import { expect, test } from "@playwright/test";

import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";
import {
  SELECT_ALL_SHORTCUT,
  buildAppGenSkillsResponse,
  buildGetLLMResponseResponse,
  closeSkillsMcpViewer,
  getVisibleProjectChatAuxTestId,
  openRawSkillMarkdown,
  openSkillsViewer,
  openSlashCommandsViewer,
} from "./project-ai-chat-skills-mcp-viewer-helpers";

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
            transport: "streamable_http",
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

  const projectChatSurface = await openSkillsViewer(page);

  await expect(
    projectChatSurface.getByTestId("project-chat-skills-view"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-skills-content"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tabs"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tab-skills"),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tab-mcp"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tab-slash-commands"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tab-ai-settings"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-skills-refresh"),
  ).toBeVisible();
  await expect(projectChatSurface.getByText("/workspace/skills")).toBeVisible();
  await expect(
    projectChatSurface.getByText("/home/.codex/skills"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /ui-layout/i }).first(),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByRole("button", { name: /frontend-design/i }),
  ).toBeVisible();
  const skillMarkdownToggle = projectChatSurface.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await expect(skillMarkdownToggle).toBeVisible();
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "false");
  await skillMarkdownToggle.click();
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    projectChatSurface.getByTestId("project-chat-skill-markdown-view-rendered"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-skill-markdown-view-raw"),
  ).toBeVisible();
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-rendered")
    .click();
  await expect(
    projectChatSurface.getByLabel("Skill Markdown Content"),
  ).toHaveCount(0);
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();
  await expect(
    projectChatSurface.getByTestId("project-chat-skills-resize-handle"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByLabel("Skill Markdown Content"),
  ).toContainText("Create dense dashboard layouts.");
  await expect(
    projectChatSurface.getByTestId(
      "project-chat-custom-skill-relative-path-input",
    ),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-create"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-save"),
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
    projectChatSurface.getByRole("button", {
      name: /Copy path for Workspace skills/i,
    }),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByRole("button", {
      name: /Reveal path for Workspace skills/i,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Filter MCP tools")).toHaveCount(0);
  await expect(page.getByText("Viewer only:")).toHaveCount(0);
  await expect(page.getByText("MCP tools discovered:")).toHaveCount(0);
  await expect(page.getByText("MCP servers configured:")).toHaveCount(0);
  await expect(page.getByTestId("project-chat-mcp-content")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-slash-tab")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-slash-command")).toHaveCount(0);
  await expect(page.getByTestId("skills-mcp-slash-list-pane")).toHaveCount(0);
  await projectChatSurface.getByTestId("project-chat-aux-tab-mcp").click();
  await expect(
    projectChatSurface.getByTestId("project-chat-mcp-content"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tab-mcp"),
  ).toHaveAttribute("aria-current", "page");
  await projectChatSurface
    .getByTestId("project-chat-aux-tab-ai-settings")
    .click();
  await expect(
    projectChatSurface.getByTestId("project-ai-settings-scroll-region"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tabs"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-aux-tab-ai-settings"),
  ).toHaveAttribute("aria-current", "page");
  await projectChatSurface.getByTestId("project-chat-aux-tab-skills").click();
  await expect(
    projectChatSurface.getByTestId("project-chat-skills-content"),
  ).toBeVisible();

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
    const projectChatSurface = await openSkillsViewer(page);
    await projectChatSurface
      .getByTestId("skills-mcp-skill-name")
      .filter({ hasText: "locked-skill" })
      .click();
    await openRawSkillMarkdown(page);

    const saveButton = projectChatSurface.getByTestId(
      "project-chat-custom-skill-save",
    );
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
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    const projectChatSurface = await openSlashCommandsViewer(page);

    await expect(
      projectChatSurface.getByTestId("project-chat-slash-commands-view"),
    ).toBeVisible();
    await expect(
      projectChatSurface.getByTestId("skills-mcp-slash-commands-content"),
    ).toBeVisible();
    await expect(page.getByTestId("project-chat-mcp-content")).toHaveCount(0);
    await expect(page.getByTestId("project-chat-skills-content")).toHaveCount(
      0,
    );
    await expect(
      projectChatSurface.getByTestId("project-chat-aux-tabs"),
    ).toBeVisible();
    await expect(
      projectChatSurface.getByTestId("project-chat-aux-tab-slash-commands"),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      projectChatSurface.getByTestId("skills-mcp-slash-tab").first(),
    ).toBeVisible();
    const slashCommandRows = projectChatSurface.getByTestId(
      "skills-mcp-slash-command",
    );
    await expect(slashCommandRows.first()).toBeVisible();
    await expect(slashCommandRows).toContainText(["/new", "/resume", "/model"]);
    const slashListPane = projectChatSurface.getByTestId(
      "skills-mcp-slash-list-pane",
    );
    await expect(slashListPane).toBeVisible();
    await expect(slashListPane).toHaveCSS("overflow-y", "auto");
    await expect(slashListPane).toHaveCSS("border-top-width", "0px");
    await expect(
      page.getByTestId("skills-mcp-slash-resize-handle"),
    ).toHaveCount(0);
    const customCommandInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-command-input",
    );
    const customPromptInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-prompt-input",
    );
    const customAddButton = projectChatSurface.getByTestId(
      "project-chat-custom-slash-add",
    );
    await customCommandInput.fill("/project-status");
    await customPromptInput.fill("Summarize project health and open risks.");
    await expect
      .poll(async () => await customAddButton.isEnabled(), { timeout: 10_000 })
      .toBe(true);
    await customAddButton.click();
    await expect(
      projectChatSurface
        .getByTestId("project-chat-custom-slash-command")
        .filter({
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
    await projectChatSurface
      .getByTestId("project-chat-custom-slash-remove")
      .filter({ hasText: "Remove" })
      .first()
      .click();
    await expect(
      projectChatSurface
        .getByTestId("project-chat-custom-slash-command")
        .filter({
          hasText: "/project-status",
        }),
    ).toHaveCount(0);
    await expect(
      projectChatSurface.getByText(
        "Agent-native slash commands apply to external agents.",
      ),
    ).toBeVisible();

    await closeSkillsMcpViewer(page);
    await expect(
      page.getByTestId("project-chat-slash-commands-view"),
    ).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
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
  const projectChatSurface = await openSlashCommandsViewer(page);

  await expect(
    projectChatSurface.getByTestId("project-chat-custom-slash-command-input"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-slash-prompt-input"),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByText("No engines configured."),
  ).toBeVisible();
  await expect(page.getByTestId("skills-mcp-slash-tab")).toHaveCount(0);

  await projectChatSurface
    .getByTestId("project-chat-custom-slash-command-input")
    .fill("/project-status");
  await projectChatSurface
    .getByTestId("project-chat-custom-slash-prompt-input")
    .fill("Summarize project health.");
  await projectChatSurface.getByTestId("project-chat-custom-slash-add").click();

  await expect(
    projectChatSurface.getByTestId("project-chat-custom-slash-command").filter({
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
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-skills-view"),
  ).toBeVisible();
  await expect.poll(() => skillsRequests).toBeGreaterThanOrEqual(1);
  expect(skillsRequests).toBeLessThanOrEqual(2);
  expect(mcpRequests).toBe(0);
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
  let engineCleanup = async () => {};

  try {
    projectContext = await openIsolatedProject(page);
    engineCleanup = await ensureManagedChatEngine(page);
    const projectChatSurface = await openSlashCommandsViewer(page);

    await projectChatSurface
      .getByTestId("project-chat-custom-slash-command-input")
      .fill("/attach-summary");
    await projectChatSurface
      .getByTestId("project-chat-custom-slash-prompt-input")
      .fill("Summarize the attached file.");
    await expect
      .poll(
        async () =>
          await projectChatSurface
            .getByTestId("project-chat-custom-slash-add")
            .isEnabled(),
        { timeout: 10_000 },
      )
      .toBe(true);
    await projectChatSurface
      .getByTestId("project-chat-custom-slash-add")
      .click();

    await closeSkillsMcpViewer(page);

    const activeProjectChatSurface = await getVisibleProjectChatSurface(page);
    const fileInput = activeProjectChatSurface
      .locator('input[type="file"]')
      .first();
    await expect(fileInput).not.toBeDisabled();
    await fileInput.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("release notes"),
    });
    await expect(activeProjectChatSurface.getByText("notes.txt")).toBeVisible();

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/getLLMResponse"),
    );
    await activeProjectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/attach-summary first line\n\n  second line");
    await activeProjectChatSurface.getByLabel("Send message").click();

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
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("custom app-generation slash commands submit with the selected mode", async ({
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

  const capturedRequests: Array<{
    appGenerationMode?: string | null;
    appGenerationByMessageId?: Record<string, string>;
    message?: {
      id?: string;
      content?: Array<{
        text?: string;
      }>;
    };
  }> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(
      route.request().postDataJSON() as (typeof capturedRequests)[number],
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildGetLLMResponseResponse("custom-mode-chat")),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: {},
      }),
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
        appGenerationByMessageId: {},
      }),
    });
  });

  await ensureAppReady(page);
  let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
    null;
  let engineCleanup = async () => {};

  try {
    projectContext = await openIsolatedProject(page);
    engineCleanup = await ensureManagedChatEngine(page);
    const projectChatSurface = await openSlashCommandsViewer(page);

    const customCommandInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-command-input",
    );
    const customPromptInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-prompt-input",
    );
    const customModeInput = projectChatSurface.locator(
      "#project-chat-custom-slash-mode-input",
    );
    const customAddButton = projectChatSurface.getByTestId(
      "project-chat-custom-slash-add",
    );

    await customCommandInput.fill("/wireframe");
    await customPromptInput.fill("Create a wireframe dashboard.");
    await customModeInput.click();
    await customModeInput.press(SELECT_ALL_SHORTCUT);
    await customModeInput.fill("JSON Render");
    await customModeInput.press("Enter");
    await expect(customModeInput).toHaveValue("JSON Render");
    await expect
      .poll(async () => await customAddButton.isEnabled(), { timeout: 10_000 })
      .toBe(true);
    await customAddButton.click();

    const customCommandRow = projectChatSurface
      .getByTestId("project-chat-custom-slash-command")
      .filter({ hasText: "/wireframe" })
      .locator("..");
    await expect(customCommandRow).toBeVisible();
    await expect(customCommandRow).toContainText("Submits as JSON Render.");
    const projectConfigId = projectContext.projectConfigId;
    await expect
      .poll(() =>
        page.evaluate((currentProjectConfigId) => {
          const raw = window.localStorage.getItem("setta_data");
          if (!raw) {
            return null;
          }
          const parsed = JSON.parse(raw) as {
            state?: {
              customProjectChatSlashCommandsByProjectConfigId?: Record<
                string,
                Array<{
                  command?: string;
                  prompt?: string;
                  appGenerationMode?: string | null;
                }>
              >;
            };
          };
          return (
            parsed.state?.customProjectChatSlashCommandsByProjectConfigId?.[
              currentProjectConfigId
            ] ?? null
          );
        }, projectConfigId),
      )
      .toEqual([
        {
          command: "/wireframe",
          prompt: "Create a wireframe dashboard.",
          appGenerationMode: "json_render",
        },
      ]);

    await closeSkillsMcpViewer(page);

    const activeProjectChatSurface = await getVisibleProjectChatSurface(page);
    await activeProjectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/wireframe support ops");
    await activeProjectChatSurface.getByLabel("Send message").click();

    await expect.poll(() => capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.appGenerationMode).toBe("json_render");
    expect(capturedRequests[0]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "json_render",
    });
    expect(capturedRequests[0]?.message?.content?.[0]?.text).toBe(
      "Create a wireframe dashboard.\n\nsupport ops",
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("custom plain-chat slash commands clear app-generation mode inside active app threads", async ({
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

  const capturedRequests: Array<{
    chatId?: string | null;
    appGenerationMode?: string | null;
    appGenerationByMessageId?: Record<string, string>;
    message?: {
      id?: string;
      content?: Array<{
        text?: string;
      }>;
      attachments?: Array<{
        name?: string;
      }>;
    };
  }> = [];
  const chatStateById = new Map<
    string,
    {
      messages: Array<
        NonNullable<(typeof capturedRequests)[number]["message"]>
      >;
      appGenerationByMessageId: Record<string, string>;
    }
  >();
  let createdChatCount = 0;
  let assistantMessageCount = 0;

  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route
      .request()
      .postDataJSON() as (typeof capturedRequests)[number];
    capturedRequests.push(payload);
    const returnedChatId =
      payload.chatId ?? `custom-plain-chat-${createdChatCount + 1}`;
    const previousState = chatStateById.get(returnedChatId) ?? {
      messages: [],
      appGenerationByMessageId: {},
    };
    const nextMessages = [...previousState.messages];
    if (payload.message) {
      nextMessages.push(payload.message);
      assistantMessageCount += 1;
      nextMessages.push({
        id: `assistant-${assistantMessageCount}`,
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Mock response ${assistantMessageCount}`,
          },
        ],
        attachments: [],
      });
    }
    chatStateById.set(returnedChatId, {
      messages: nextMessages,
      appGenerationByMessageId: payload.appGenerationByMessageId ?? {},
    });
    if (payload.chatId == null) {
      createdChatCount += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildGetLLMResponseResponse(returnedChatId)),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as {
      chatId?: string;
    };
    const chatState =
      typeof payload.chatId === "string"
        ? chatStateById.get(payload.chatId) ?? null
        : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: chatState?.messages ?? [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: chatState?.appGenerationByMessageId ?? {},
      }),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as {
      chatId?: string;
    };
    const chatState =
      typeof payload.chatId === "string"
        ? chatStateById.get(payload.chatId) ?? null
        : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: chatState?.messages ?? [],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
        appGenerationByMessageId: chatState?.appGenerationByMessageId ?? {},
      }),
    });
  });
  await page.route("**/api/stopLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alreadyStopped: false,
        stoppedRunId: "mock-run",
        stoppedMessageId: null,
      }),
    });
  });
  await page.route("**/api/stopExternalAgentRun", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(null),
    });
  });

  await ensureAppReady(page);
  let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
    null;
  let engineCleanup = async () => {};

  try {
    projectContext = await openIsolatedProject(page);
    engineCleanup = await ensureManagedChatEngine(page);
    await seedLocalStorage(page, {
      customProjectChatSlashCommandsByProjectConfigId: {
        [projectContext.projectConfigId]: [
          {
            command: "/plain-review",
            prompt: "Review the current plan.",
            appGenerationMode: null,
          },
        ],
      },
    });
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    const projectChatSurface = await openSlashCommandsViewer(page);

    const customCommandRow = projectChatSurface
      .getByTestId("project-chat-custom-slash-command")
      .filter({ hasText: "/plain-review" })
      .locator("..");
    await expect(customCommandRow).toBeVisible();
    await expect(customCommandRow).toContainText("Submits as Plain chat.");

    await closeSkillsMcpViewer(page);

    const activeProjectChatSurface = await getVisibleProjectChatSurface(page);
    await activeProjectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/app-json support ops dashboard");
    await activeProjectChatSurface.getByLabel("Send message").click();
    await expect.poll(() => capturedRequests.length).toBe(1);
    await expect(
      activeProjectChatSurface.getByLabel("Stop response"),
    ).toBeVisible();
    await activeProjectChatSurface.getByLabel("Stop response").click();
    await expect(
      activeProjectChatSurface.getByLabel("Send message"),
    ).toBeVisible();

    await activeProjectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/plain-review keep the language concise");
    await projectChatSurface.getByLabel("Send message").click();
    await expect.poll(() => capturedRequests.length).toBe(2);
    await expect(projectChatSurface.getByLabel("Send message")).toBeVisible();

    await projectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("tighten the copy further");
    await projectChatSurface.getByLabel("Send message").click();
    await expect.poll(() => capturedRequests.length).toBe(3);

    expect(capturedRequests[0]?.appGenerationMode).toBe("json_render");
    expect(capturedRequests[1]?.appGenerationMode).toBeNull();
    expect(capturedRequests[1]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "json_render",
      [capturedRequests[1]?.message?.id ?? ""]: "plain_chat",
    });
    expect(capturedRequests[1]?.message?.content?.[0]?.text).toBe(
      "Review the current plan.\n\nkeep the language concise",
    );
    expect(capturedRequests[2]?.appGenerationMode).toBeNull();
    expect(capturedRequests[2]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "json_render",
      [capturedRequests[1]?.message?.id ?? ""]: "plain_chat",
      [capturedRequests[2]?.message?.id ?? ""]: "plain_chat",
    });
    expect(capturedRequests[2]?.message?.content?.[0]?.text).toBe(
      "tighten the copy further",
    );
  } finally {
    await engineCleanup();
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
  const projectChatSurface = await getVisibleProjectChatSurface(page);

  await projectChatSurface
    .getByRole("button", { name: "Project AI Settings" })
    .click();
  const activityAccordionDefaultRow = getVisibleProjectChatAuxTestId(
    page,
    "project-chat-settings-activity-accordion-default",
  );
  const activityChildrenDefaultRow = getVisibleProjectChatAuxTestId(
    page,
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

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-settings-open-project-settings",
  ).click();
  await expect(
    page
      .locator('[data-testid="project-ai-settings-scroll-region"]:visible')
      .first(),
  ).toBeVisible();
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-aux-tabs"),
  ).toBeVisible();
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-aux-tab-ai-settings"),
  ).toHaveAttribute("aria-current", "page");
});
