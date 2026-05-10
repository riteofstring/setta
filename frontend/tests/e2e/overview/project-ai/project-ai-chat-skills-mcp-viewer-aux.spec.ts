import { expect, test } from "@playwright/test";

import {
  allowExpectedApiError,
  ensureAppReady,
  ensureProjectChatThreadsPanelVisible,
  getVisibleProjectChatSurface,
  seedLocalStorage,
} from "../../helpers";
import {
  SELECT_ALL_SHORTCUT,
  buildAppGenSkillsResponse,
  closeSkillsMcpViewer,
  expectHasEllipsisTruncation,
  getVisibleProjectChatAuxTestId,
  openMcpViewer,
  openSkillsViewer,
} from "./project-ai-chat-skills-mcp-viewer-helpers";

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
  await expect(
    (await getVisibleProjectChatSurface(page)).getByTestId(
      "chat-input-textarea",
    ),
  ).toBeVisible();

  await openSkillsViewer(page);
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-skills-view"),
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");
  await expect(page.getByTestId("project-chat-skills-view")).toHaveCount(0);
  await expect(
    (await getVisibleProjectChatSurface(page)).getByTestId(
      "chat-input-textarea",
    ),
  ).toBeVisible();
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
  const projectChatSurface = await openSkillsViewer(page);
  await projectChatSurface
    .getByRole("button", { name: "Skill Markdown Viewer" })
    .click();
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();

  const editor = projectChatSurface.getByLabel("Skill Markdown Content");
  const editorContent = editor.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.insertText("# Triage\n\nUnsaved local draft.");
  await expect(editorContent).toContainText("Unsaved local draft.");

  await projectChatSurface.getByTestId("project-chat-skills-refresh").click();
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
            transport: "streamable_http",
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
            transport: "streamable_http",
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
            transport: "streamable_http",
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
  const mcpView = getVisibleProjectChatAuxTestId(page, "project-chat-mcp-view");
  await expect(mcpView).toBeVisible();

  const serverRows = mcpView.getByTestId("skills-mcp-server-id");
  await expect(serverRows).toHaveCount(2);
  await expect(mcpView.getByText("Active external runtime")).toBeVisible();
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
            transport: "streamable_http",
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
            transport: "streamable_http",
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
  const mcpView = getVisibleProjectChatAuxTestId(page, "project-chat-mcp-view");
  await expect(mcpView).toBeVisible();

  await expect(
    mcpView.getByText("Active custom setta_files root"),
  ).toBeVisible();
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
  await expect(
    page.getByTestId("project-chat-maximized-window").first(),
  ).toBeVisible();

  const overviewPane = await getVisibleProjectChatSurface(page);
  const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
  await expect(threadsPanel).toBeVisible();

  await openMcpViewer(page);
  await expect(threadsPanel).toBeVisible();
  const mcpPane = getVisibleProjectChatAuxTestId(
    page,
    "project-chat-mcp-content",
  );
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
              transport: "streamable_http",
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
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-skills-view"),
  ).toBeVisible();

  await expectHasEllipsisTruncation(
    page.getByTestId("skills-mcp-skill-name").first(),
  );
  await expectHasEllipsisTruncation(
    page.getByTestId("skills-mcp-skill-path").first(),
  );
  await closeSkillsMcpViewer(page);

  await openMcpViewer(page);
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-mcp-view"),
  ).toBeVisible();
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
    count: 2,
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
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await ensureAppReady(page);

  const projectChatSurface = await openSkillsViewer(page);
  await expect(
    projectChatSurface.getByText("Skills unavailable (Not Found)."),
  ).toBeVisible();
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
            transport: "streamable_http",
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
            transport: "streamable_http",
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
  const projectChatSurface = await openSkillsViewer(page);

  await expect(projectChatSurface.getByText("Loading skills...")).toBeVisible();
  await expect(projectChatSurface.getByText("No skills found.")).toHaveCount(0);
  await expect(
    projectChatSurface.getByRole("button", { name: /ui-layout/i }),
  ).toBeVisible();
  await expect(projectChatSurface.getByText("Loading skills...")).toHaveCount(
    0,
  );

  await closeSkillsMcpViewer(page);
  const mcpSurface = await openMcpViewer(page);
  await expect(mcpSurface.getByText("Loading MCP servers...")).toBeVisible();
  await expect(mcpSurface.getByText("No MCP servers configured.")).toHaveCount(
    0,
  );
  await expect(mcpSurface.getByTestId("skills-mcp-server-id")).toHaveCount(1);
  await expect(mcpSurface.getByText("Loading MCP servers...")).toHaveCount(0);
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
            transport: "streamable_http",
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
  const projectChatSurface = await openSkillsViewer(page);

  await expect(
    projectChatSurface.getByRole("button", { name: /beta-skill/i }),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByRole("button", { name: /skill-202/i }),
  ).toHaveCount(1);
  await page.waitForTimeout(200);
  const fetchCountAfterInitialLoad = skillsFetchCount;
  expect(fetchCountAfterInitialLoad).toBeGreaterThan(0);
  expect(skillContentRequestCount).toBe(0);

  await projectChatSurface.getByRole("button", { name: /beta-skill/i }).click();
  await expect.poll(() => skillsFetchCount).toBe(fetchCountAfterInitialLoad);
  expect(skillContentRequestCount).toBe(0);

  await projectChatSurface
    .getByRole("button", { name: "Skill Markdown Viewer" })
    .click();
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();
  await expect.poll(() => skillContentRequestCount).toBe(1);
  const markdown = projectChatSurface.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("workspace_skills::beta-skill");
  await page.waitForTimeout(700);
  await expect(markdown).toContainText("workspace_skills::beta-skill");
  await expect(markdown).not.toContainText("workspace_skills::alpha-skill");
});
