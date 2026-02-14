import { expect, test } from "@playwright/test";
import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../helpers";

test("keeps function_calls examples rendered as text when returned inside code fences", async ({
  page,
}) => {
  const cleanupEngine = await ensureManagedChatEngine(page);
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await ensureAppReady(page);

  try {
    const mockedChatId = `pw-markup-${Date.now()}`;
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
              id: "assistant-1",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: [
                    "Here is the XML format example:",
                    "```xml",
                    "<function_calls>",
                    '<invoke name="setta__create_top_level_section">',
                    '<parameter name="name">Example</parameter>',
                    "</invoke>",
                    "</function_calls>",
                    "```",
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

    const chatInput = page.getByPlaceholder("Type a message...");
    await chatInput.fill("show XML format");
    await chatInput.press("Enter");

    await expect(page.getByText("<function_calls>")).toBeVisible();
    await expect(
      page.getByText('<invoke name="setta__create_top_level_section">'),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Tool call was returned as plain text and was not executed.",
      ),
    ).toHaveCount(0);
  } finally {
    await cleanupEngine();
  }
});
