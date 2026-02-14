import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../helpers";

test("app config prompt preview can be edited and sent without tab switch", async ({
  page,
}) => {
  await ensureManagedChatEngine(page);
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const catalogId = await page.getByLabel("Catalog ID").inputValue();
  await page.getByRole("button", { name: "Build Prompt", exact: true }).click();

  const promptPreview = page.getByLabel("App generation prompt preview");
  await expect(promptPreview).toBeVisible();
  await expect(promptPreview).toContainText(
    "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
  );

  const prompt = await promptPreview.inputValue();
  expect(prompt).toContain("DO NOT paste JSON into the chat.");
  expect(prompt).toContain("setta__set_app_definition");
  expect(prompt).toContain(`Catalog: ${catalogId}`);
  expect(prompt).toContain("Pages and navigation:");
  expect(prompt).toContain("- Treat tab view modes as pages.");
  expect(prompt).toContain("- routes: list of { path, name, rootKey }");

  const marker = `E2E-PROMPT-${Date.now()}`;
  await promptPreview.fill(`${prompt}\n\n${marker}`);

  const mockedChatId = `pw-app-gen-${Date.now()}`;
  await page.route("**/api/getLLMResponse", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockedChatId),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: [
              {
                type: "text",
                text: "<no_thinking>Build complete</no_thinking>",
              },
            ],
            tool_calls: null,
          },
        ],
        waitingForResponse: true,
        llmConfig: null,
      }),
    });
  });

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/getLLMResponse"),
  );
  const generateButton = page.getByRole("button", {
    name: "Generate",
    exact: true,
  });
  await expect(generateButton).toBeVisible();
  await generateButton.click();
  const request = await requestPromise;
  const payload = request.postDataJSON() as {
    message?: {
      content?: Array<{ text?: string }>;
    };
    overrideSkillIds?: string[] | null;
  };
  expect(payload.message?.content?.[0]?.text ?? "").toContain(marker);
  expect(Array.isArray(payload.overrideSkillIds)).toBeTruthy();
  await expect(page.getByText("App Config")).toBeVisible();

  const projectAIChatIcon = page.getByTestId("overview-project-ai-chat-icon");
  await expect(projectAIChatIcon).toHaveAttribute("data-ai-active", "true");

  await projectAIChatIcon.locator("xpath=ancestor::button[1]").click();
  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();
  await expect(overviewPane.getByText("Build complete")).toBeVisible();
  await expect(overviewPane.getByText("no_thinking")).toHaveCount(0);
});

test("generate stays disabled when no usable setta llm engine exists", async ({
  page,
}) => {
  await page.route("**/api/getEngineConfigs", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "external-only",
          name: "External only",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-1",
        },
      ]),
    });
  });

  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();
  await page.getByRole("button", { name: "Build Prompt", exact: true }).click();
  await expect(page.getByLabel("App generation prompt preview")).toBeVisible();

  const generateButton = page.getByRole("button", {
    name: "Generate",
    exact: true,
  });
  await expect(generateButton).toBeDisabled();
  await expect(generateButton).toHaveAttribute(
    "title",
    "No usable Setta LLM engine is configured. Open Project AI Chat and select an LLM config.",
  );
  await expect(
    page.getByText(
      "No usable Setta LLM engine is configured. Open Project AI Chat and select an LLM config.",
    ),
  ).toBeVisible();
});
