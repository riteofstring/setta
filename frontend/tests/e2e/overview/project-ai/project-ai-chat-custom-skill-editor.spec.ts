import { expect, test } from "@playwright/test";

import {
  allowExpectedApiError,
  ensureAppReady,
  seedLocalStorage,
} from "../../helpers";
import {
  SELECT_ALL_SHORTCUT,
  buildAppGenSkillsResponse,
  buildUpsertAppGenCustomSkillResponse,
  clickSkillMarkdownViewToggle,
  closeSkillsMcpViewer,
  getVisibleProjectChatAuxTestId,
  openMcpViewer,
  openRawSkillMarkdown,
  openSkillsViewer,
} from "./project-ai-chat-skills-mcp-viewer-helpers";

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

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-save",
  ).click();
  await expect.poll(() => upsertPayloads.length).toBe(1);
  expect(upsertPayloads[0]).toMatchObject({
    skillId: "user_agents_skills::custom-one",
    relativePath: null,
  });

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-relative-path-input",
  ).fill("new-custom-skill");
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-create",
  ).click();
  await expect.poll(() => upsertPayloads.length).toBe(2);
  expect(upsertPayloads[1]).toMatchObject({
    skillId: null,
    relativePath: "new-custom-skill",
  });
  await expect(
    page.getByRole("button", { name: /new-custom-skill/i }),
  ).toBeVisible();
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-root-path"),
  ).toContainText(rootPath);
  await expect(
    getVisibleProjectChatAuxTestId(
      page,
      "project-chat-custom-skill-root-reveal",
    ),
  ).toBeEnabled();
  await expect(page.getByLabel("Skill Markdown Content").first()).toContainText(
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
  await openRawSkillMarkdown(page);

  const markdown = page.getByLabel("Skill Markdown Content").first();
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

  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-raw",
  );
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-save"),
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

  const markdown = page.getByLabel("Skill Markdown Content").first();
  await expect(markdown).toContainText("Original body");
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-relative-path-input",
  ).fill("existing");
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-create",
  ).click();

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
  const projectChatSurface = await openRawSkillMarkdown(page);

  const markdown = projectChatSurface.getByLabel("Skill Markdown Content");
  const betaSkillRow = projectChatSurface.getByRole("button", {
    name: /beta-custom/i,
  });
  await expect(markdown).toContainText("Alpha initial body");

  const editorContent = markdown.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type("# alpha-custom\n\nAlpha saved update");
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-save",
  ).click();

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
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-save"),
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
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-save"),
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
    getVisibleProjectChatAuxTestId(page, "project-chat-custom-skill-save"),
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

  const editor = page.getByLabel("Skill Markdown Content").first();
  const editorContent = editor.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.press("Backspace");
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-custom-skill-save",
  ).click();

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
        llmConfigPath: "",
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
        content: "# UI Layout\n\nPreview body",
        truncated: true,
        originalSizeBytes: 900000,
      }),
    });
  });

  await ensureAppReady(page);
  const mcpSurface = await openMcpViewer(page);
  await expect(mcpSurface.getByText("Unavailable")).toBeVisible();
  await expect(
    mcpSurface.getByRole("button", {
      name: /Reveal path for Active .*setta_files/i,
    }),
  ).toBeDisabled();

  await closeSkillsMcpViewer(page);
  const projectChatSurface = await openSkillsViewer(page);

  const skillMarkdownToggle = projectChatSurface.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Skill Markdown Content")).toHaveCount(0);

  await skillMarkdownToggle.click();
  await clickSkillMarkdownViewToggle(
    page,
    "project-chat-skill-markdown-view-raw",
  );

  await expect(page.getByLabel("Skill Markdown Content").first()).toContainText(
    "Preview body",
  );
  await expect(
    page.getByText("Preview truncated from 900,000 bytes."),
  ).toBeVisible();
});
