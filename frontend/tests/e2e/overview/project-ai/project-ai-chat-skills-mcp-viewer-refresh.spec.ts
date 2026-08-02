import { expect, test } from "@playwright/test";

import {
  allowExpectedApiError,
  ensureAppReady,
  seedLocalStorage,
} from "../../helpers";
import {
  buildAppGenSkillsResponse,
  buildUpsertAppGenCustomSkillResponse,
  clickSkillMarkdownViewToggle,
  getVisibleProjectChatAuxTestId,
  openRawSkillMarkdown,
  openSkillsViewer,
} from "./project-ai-chat-skills-mcp-viewer-helpers";

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
  const projectChatSurface = await openSkillsViewer(page);
  await expect(
    projectChatSurface.getByRole("button", { name: /beta-skill/i }),
  ).toBeVisible();

  const viewerToggle = projectChatSurface.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-raw",
  );
  await expect(
    projectChatSurface.getByLabel("Skill Markdown Content"),
  ).toBeVisible();
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "false");
  await projectChatSurface.getByRole("button", { name: /beta-skill/i }).click();

  // Allow the stale alpha response to resolve while the viewer is closed.
  await page.waitForTimeout(700);

  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-raw",
  );
  const markdown = projectChatSurface.getByLabel("Skill Markdown Content");
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
  const projectChatSurface = await openSkillsViewer(page);
  await projectChatSurface
    .getByRole("button", { name: "Skill Markdown Viewer" })
    .click();
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();

  const markdown = projectChatSurface.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("Revision 1");

  await projectChatSurface.getByTestId("project-chat-skills-refresh").click();
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
  let refreshTriggered = false;
  let postRefreshRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (!refreshTriggered) {
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
    count: 2,
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
  const projectChatSurface = await openSkillsViewer(page);
  await projectChatSurface
    .getByRole("button", { name: "Skill Markdown Viewer" })
    .click();
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();

  await expect(
    page.getByRole("button", { name: /ui-layout/i }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content").first()).toContainText(
    "Stable preview",
  );

  await projectChatSurface.getByTestId("project-chat-skills-refresh").click();
  await expect(
    page.getByRole("button", { name: /ui-layout/i }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content").first()).toContainText(
    "Stable preview",
  );
  await expect(
    projectChatSurface.getByTestId("project-chat-skills-refresh"),
  ).toBeEnabled();
});

test("project ai chat refresh is disabled while loading to prevent redundant scans", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsRequestCount = 0;
  let refreshTriggered = false;
  let postRefreshRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (!refreshTriggered) {
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
    postRefreshRequestCount += 1;
    if (postRefreshRequestCount === 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
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
  const projectChatSurface = await openSkillsViewer(page);
  await expect(
    page.getByRole("button", { name: /baseline/i }).first(),
  ).toBeVisible();
  const baselineRequestCount = skillsRequestCount;

  const refreshButton = projectChatSurface.getByTestId(
    "project-chat-skills-refresh",
  );
  refreshTriggered = true;
  await refreshButton.click();
  await expect(refreshButton).toBeDisabled();
  await expect.poll(() => skillsRequestCount).toBe(baselineRequestCount + 1);
  await refreshButton.evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  await page.waitForTimeout(100);
  expect(skillsRequestCount).toBe(baselineRequestCount + 1);
  await expect(
    page.getByRole("button", { name: /fresh-skill/i }).first(),
  ).toBeVisible();
  await expect(refreshButton).toBeEnabled();
  expect(skillsRequestCount).toBe(baselineRequestCount + 1);
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
  const projectChatSurface = await openSkillsViewer(page);

  await projectChatSurface
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

  const rootHint = getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-root-path",
  );
  await expect(rootHint).toContainText(createRootPath);
  await expect(rootHint).toContainText("not created yet");
  await expect(rootHint).not.toContainText("/workspace/.agents/skills");
  await expect(
    getVisibleProjectChatAuxTestId(
      page,
      "project-chat-custom-skill-root-reveal",
    ),
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

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-relative-path-input",
  ).fill("new-custom-skill");
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-create"),
  ).toBeDisabled();
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-root-path"),
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
  let refreshTriggered = false;
  await page.route("**/api/getAppGenSkills", async (route) => {
    if (!refreshTriggered) {
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
    count: 2,
    ttlMs: 20_000,
  });

  await ensureAppReady(page);
  const projectChatSurface = await openSkillsViewer(page);

  await projectChatSurface
    .getByTestId("project-chat-custom-skill-relative-path-input")
    .fill("new-custom-skill");
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-create"),
  ).toBeEnabled();
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-root-reveal"),
  ).toBeEnabled();

  refreshTriggered = true;
  await projectChatSurface.getByTestId("project-chat-skills-refresh").click();

  await expect(
    page.getByText("Skills unavailable (forced refresh failure)."),
  ).toBeVisible();
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-root-path"),
  ).toContainText("Custom skills root unavailable.");
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-root-reveal"),
  ).toBeDisabled();
  await expect(
    projectChatSurface.getByTestId("project-chat-custom-skill-create"),
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
  const baselineSkillsRequestCount = skillsRequestCount;

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-relative-path-input",
  ).fill("created-skill");
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-create",
  ).click();

  await expect(
    page.getByText("Created custom skill created-skill."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /created-skill/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content").first()).toContainText(
    "# created-skill",
  );
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-save"),
  ).toBeEnabled();
  expect(skillsRequestCount).toBe(baselineSkillsRequestCount);
  expect(skillContentRequestCount).toBe(0);
});
