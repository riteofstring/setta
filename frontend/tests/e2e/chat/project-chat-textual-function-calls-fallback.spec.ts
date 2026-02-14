import { expect, test } from "@playwright/test";
import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../helpers";

test("project chat renders text-encoded function calls as failed tool cards", async ({
  page,
}) => {
  await ensureManagedChatEngine(page);
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  const mockedChatId = `pw-text-tool-${Date.now()}`;
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
                text: [
                  "I will create a section now.",
                  "<function_calls>",
                  '<invoke name="setta__create_top_level_section">',
                  '<parameter name="projectConfigId">13</parameter>',
                  '<parameter name="implType">TextBlock</parameter>',
                  '<parameter name="name">Task Manager</parameter>',
                  "</invoke>",
                  "</function_calls>",
                ].join("\n"),
              },
            ],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
      }),
    });
  });

  const chatInput = overviewPane.getByPlaceholder("Type a message...");
  await expect(chatInput).toBeVisible();
  await chatInput.fill("Create a task manager app");
  await chatInput.press("Enter");

  const toolCallRow = overviewPane.getByText("setta__create_top_level_section");
  await expect(toolCallRow).toBeVisible();
  await expect(
    overviewPane.getByText("<function_calls>", { exact: false }),
  ).toHaveCount(0);
  await expect(overviewPane.getByText("<invoke", { exact: false })).toHaveCount(
    0,
  );

  await toolCallRow.first().click();
  await expect(overviewPane.getByText("Arguments")).toBeVisible();
  await expect(overviewPane.getByText("Result")).toBeVisible();
  await expect(
    overviewPane.getByText(
      "Tool call was returned as plain text and was not executed.",
      { exact: false },
    ),
  ).toBeVisible();
});
