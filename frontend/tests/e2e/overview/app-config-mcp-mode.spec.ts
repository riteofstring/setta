import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("mcp mode exposes figma actions and skills/mcp browser data", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "mcp_server",
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
      ]),
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

  await page.route("**/api/__setta__/tools/call", async (route) => {
    const payload = route.request().postDataJSON() as { tool?: string };
    if (payload.tool === "list_mcp_tools") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [],
          structuredContent: {
            tools: [
              "setta__set_app_definition",
              "setta__stream_app_definition",
              "setta__search_mcp_tools",
            ],
          },
          isError: false,
        }),
      });
      return;
    }
    await route.continue();
  });

  const capturedRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();

  await expect(page.getByText("Skills / MCP Browser")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /ui-layout Workspace skills/,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Skill Preview")).toContainText(
    "Create dense dashboard layouts.",
  );
  await expect(page.getByText("MCP tools discovered: 3")).toBeVisible();

  await page
    .getByLabel("Figma source")
    .fill("https://www.figma.com/file/abc123/design-system");
  await page.getByRole("button", { name: "Pull Figma Design" }).click();

  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();
  expect(capturedRequests.length).toBeGreaterThan(0);
  const request = capturedRequests.at(-1) ?? {};
  expect(request.appGenerationMode).toBe("mcp_server");
  const message = request.message as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textContent = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  expect(textContent).toContain("Import this Figma design into Setta");
});
