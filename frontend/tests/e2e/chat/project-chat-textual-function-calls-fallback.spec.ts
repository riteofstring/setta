import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../helpers";

async function openProjectAIChat(page: Page) {
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
  return overviewPane;
}

async function mockTextualAssistantResponse(
  page: Page,
  text: string,
) {
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
            content: [{ type: "text", text }],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
      }),
    });
  });
}

test("project chat renders text-encoded function calls as failed tool cards", async ({
  page,
}) => {
  const overviewPane = await openProjectAIChat(page);
  await mockTextualAssistantResponse(
    page,
    [
      "I will create a section now.",
      "<function_calls>",
      '<invoke name="setta__create_top_level_section">',
      '<parameter name="projectConfigId">13</parameter>',
      '<parameter name="implType">TextBlock</parameter>',
      '<parameter name="name">Task Manager</parameter>',
      "</invoke>",
      "</function_calls>",
    ].join("\n"),
  );

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

test("project chat does not duplicate fallback cards for multi-tool text payloads", async ({
  page,
}) => {
  const overviewPane = await openProjectAIChat(page);
  await mockTextualAssistantResponse(
    page,
    [
      "I will call two tools now.",
      "<function_calls>",
      '<invoke name="setta__create_top_level_section">',
      '<parameter name="projectConfigId">13</parameter>',
      '<parameter name="implType">TextBlock</parameter>',
      "</invoke>",
      '<invoke name="setta__set_section_name">',
      '<parameter name="sectionId">abc-123</parameter>',
      '<parameter name="name">Task Manager</parameter>',
      "</invoke>",
      "</function_calls>",
    ].join("\n"),
  );

  const chatInput = overviewPane.getByPlaceholder("Type a message...");
  await expect(chatInput).toBeVisible();
  await chatInput.fill("Create and name section");
  await chatInput.press("Enter");

  const createCall = overviewPane.getByText("setta__create_top_level_section", {
    exact: true,
  });
  const renameCall = overviewPane.getByText("setta__set_section_name", {
    exact: true,
  });
  await expect(createCall).toHaveCount(1);
  await expect(renameCall).toHaveCount(1);
  await createCall.click();
  await renameCall.click();
  await expect(
    overviewPane.getByText(
      "Tool call was returned as plain text and was not executed.",
      { exact: false },
    ),
  ).toHaveCount(2);
});

test("project chat keeps plain tool-name lines as assistant text", async ({
  page,
}) => {
  const overviewPane = await openProjectAIChat(page);
  await mockTextualAssistantResponse(
    page,
    [
      "Recommended tools:",
      "setta__getProjectConfigNamesAndIds",
      "setta__get_latest_project_state_summary",
      "Use these names when invoking tools.",
    ].join("\n"),
  );

  const chatInput = overviewPane.getByPlaceholder("Type a message...");
  await expect(chatInput).toBeVisible();
  await chatInput.fill("Show recommended tool names");
  await chatInput.press("Enter");

  await expect(
    overviewPane.getByText("setta__getProjectConfigNamesAndIds", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    overviewPane.getByText("setta__get_latest_project_state_summary", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    overviewPane.getByText(
      "Tool call was returned as plain text and was not executed.",
      { exact: false },
    ),
  ).toHaveCount(0);
});
