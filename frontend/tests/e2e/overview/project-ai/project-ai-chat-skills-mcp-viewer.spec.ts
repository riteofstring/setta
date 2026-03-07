import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  allowExpectedApiError,
  ensureAppReady,
  seedLocalStorage,
} from "../../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

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
  expect(styleInfo.scrollWidth).toBeGreaterThan(styleInfo.clientWidth);
}

async function openSkillsViewer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Project AI Settings" }).click();
  await page.getByTestId("project-chat-settings-open-skills").click();
}

async function openMcpViewer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Project AI Settings" }).click();
  await page.getByTestId("project-chat-settings-open-mcp").click();
}

async function openSlashCommandsViewer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Project AI Settings" }).click();
  await page.getByTestId("project-chat-settings-open-slash-commands").click();
}

async function closeSkillsMcpViewer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Return to chat" }).click();
}

async function openRawSkillMarkdown(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skill Markdown Viewer" }).click();
  await page
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();
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
      body: JSON.stringify([
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
  await page.getByTestId("project-chat-skill-markdown-view-rendered").click();
  await expect(page.getByLabel("Skill Markdown Content")).toHaveCount(0);
  await page.getByTestId("project-chat-skill-markdown-view-raw").click();
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
      body: JSON.stringify([]),
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
  await expect(customAddButton).toBeEnabled();
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
      body: JSON.stringify([]),
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
      body: JSON.stringify([]),
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

test("mcp view keeps inline threads visible when threads are open", async ({
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

  const overviewPane = page.locator("#OverviewPane");
  const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
  await expect(threadsPanel).toBeVisible();
  await expect(threadsPanel).toHaveAttribute("data-inline", "true");

  await openMcpViewer(page);
  await expect(threadsPanel).toBeVisible();
  await expect(threadsPanel).toHaveAttribute("data-inline", "true");
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
      body: JSON.stringify([
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
      body: JSON.stringify([
        {
          skillId: "workspace_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace skills",
          rootPath: "/workspace/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
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
      body: JSON.stringify(skills),
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
      body: JSON.stringify([
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
  await page.getByTestId("project-chat-skill-markdown-view-raw").click();
  await expect(page.getByLabel("Skill Markdown Content")).toBeVisible();
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /beta-skill/i }).click();

  // Allow the stale alpha response to resolve while the viewer is closed.
  await page.waitForTimeout(700);

  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("project-chat-skill-markdown-view-raw").click();
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
      body: JSON.stringify([
        {
          skillId: "workspace_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace skills",
          rootPath: "/workspace/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
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
        body: JSON.stringify([
          {
            skillId: "workspace_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
        ]),
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
        body: JSON.stringify([
          {
            skillId: "workspace_skills::baseline",
            name: "baseline",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "baseline",
            description: "Baseline skill",
          },
        ]),
      });
      return;
    }
    if (skillsRequestCount === 2) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            skillId: "workspace_skills::fresh-skill",
            name: "fresh-skill",
            rootLabel: "Workspace skills",
            rootPath: "/workspace/skills",
            relativePath: "fresh-skill",
            description: "Fresh result",
          },
        ]),
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
      body: JSON.stringify([
        {
          skillId: "workspace_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace skills",
          rootPath: "/workspace/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
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
    description: string;
  }> = [
    {
      skillId: "user_agents_skills::custom-one",
      name: "custom-one",
      rootLabel: "User ~/.agents/skills",
      rootPath,
      relativePath: "custom-one",
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
      body: JSON.stringify(skills),
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
        body: JSON.stringify({
          skillId,
          created: false,
          rootPath,
          skillDocPath: `${rootPath}/${skillDirName}/SKILL.md`,
        }),
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
      description: "",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: createdSkillId,
        created: true,
        rootPath,
        skillDocPath: `${rootPath}/${nextRelativePath}/SKILL.md`,
      }),
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
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "# new-custom-skill",
  );
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
      body: JSON.stringify([
        {
          skillId: "user_agents_skills::large-custom",
          name: "large-custom",
          rootLabel: "User ~/.agents/skills",
          rootPath: "/home/.agents/skills",
          relativePath: "large-custom",
          description: "Large editable custom skill.",
        },
      ]),
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
      body: JSON.stringify({
        skillId: "user_agents_skills::large-custom",
        created: false,
        rootPath: "/home/.agents/skills",
        skillDocPath: "/home/.agents/skills/large-custom/SKILL.md",
      }),
    });
  });

  await ensureAppReady(page);
  await openSkillsViewer(page);
  await openRawSkillMarkdown(page);

  await expect(page.getByTestId("project-chat-custom-skill-save")).toBeDisabled();
  await expect(
    page.getByText("Preview is truncated. Full content loading is required"),
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
      body: JSON.stringify([
        {
          skillId: "user_agents_skills::emptyable",
          name: "emptyable",
          rootLabel: "User ~/.agents/skills",
          rootPath,
          relativePath: "emptyable",
          description: "Custom skill that can be emptied.",
        },
      ]),
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
      body: JSON.stringify({
        skillId: "user_agents_skills::emptyable",
        created: false,
        rootPath,
        skillDocPath: `${rootPath}/emptyable/SKILL.md`,
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
  await page.keyboard.press("Backspace");
  await page.getByTestId("project-chat-custom-skill-save").click();

  await expect.poll(() => upsertPayloads.length).toBe(1);
  expect(upsertPayloads[0]?.content).toBe("");
  await expect.poll(async () => {
    return editorContent.evaluate((node) => {
      const element = node as HTMLElement;
      return element.innerText.trim();
    });
  }).toBe("");
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
      body: JSON.stringify([
        {
          skillId: "workspace_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace skills",
          rootPath: "/workspace/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
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
  await page.getByTestId("project-chat-skill-markdown-view-raw").click();

  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Preview body",
  );
  await expect(
    page.getByText("Preview truncated from 900,000 bytes."),
  ).toBeVisible();
});
