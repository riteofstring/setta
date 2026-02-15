import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("project ai chat can open the skills and mcp viewer side view", async ({
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
          skillPath: "/workspace/skills/ui-layout/SKILL.md",
          description: "Create dense dashboard layouts.",
        },
        {
          skillId: "user_codex_skills::frontend-design",
          name: "frontend-design",
          rootLabel: "User ~/.codex/skills",
          rootPath: "/home/.codex/skills",
          relativePath: "frontend-design",
          skillPath: "/home/.codex/skills/frontend-design/SKILL.md",
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

  const toggleButton = page.getByRole("button", {
    name: "View Skills and MCP",
  });
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();

  await expect(page.getByText("Skills / MCP Viewer")).toBeVisible();
  await expect(page.getByText("/workspace/skills")).toBeVisible();
  await expect(page.getByText("/home/.codex/skills")).toBeVisible();
  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /frontend-design/i }),
  ).toBeVisible();
  await expect(page.getByText("Skill Markdown Viewer")).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Create dense dashboard layouts.",
  );
  await expect(page.getByText(/setta_files\/llm_config\.json/)).toBeVisible();
  await expect(
    page.getByText(/Active (local|global) setta_files/),
  ).toBeVisible();
  await expect(page.getByText(/setta.*sse/i)).toBeVisible();
  await expect(page.getByText(/context7.*stdio/i)).toBeVisible();
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

  await page.getByLabel("View Skills and MCP").click();
  await expect(page.getByText("Skills / MCP Viewer")).toHaveCount(0);
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

  await page.getByRole("button", { name: "View Skills and MCP" }).click();
  await expect(
    page.getByText(
      "Skills unavailable (Not Found). Restart the backend if this route was just added.",
    ),
  ).toBeVisible();
});
