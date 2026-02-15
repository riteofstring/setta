import { expect, test, type Page } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

async function mockHiddenGenerationChatHydration(page: Page): Promise<void> {
  await page.route("**/api/getExternalAgentChat", async (route) => {
    const requestPayload = route.request().postDataJSON() as {
      chatId?: string;
    };
    const chatId =
      typeof requestPayload.chatId === "string"
        ? requestPayload.chatId
        : "pw-chat-fallback";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: `${chatId}-assistant`,
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Hidden app generation request accepted.",
              },
            ],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
      }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    const requestPayload = route.request().postDataJSON() as {
      chatId?: string;
    };
    const chatId =
      typeof requestPayload.chatId === "string"
        ? requestPayload.chatId
        : "pw-chat-fallback";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: `${chatId}-assistant`,
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Hidden app generation request accepted.",
              },
            ],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig: {
          id: "llm-primary",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: [],
          temporary: false,
        },
      }),
    });
  });
}

test("mcp mode sends hidden app generation request without app-config browser controls", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "mcp_server",
    appGenerationPrompt: "Generate using MCP tools and persist app spec.",
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
  await mockHiddenGenerationChatHydration(page);

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();

  await expect(page.getByText("Skills / MCP Browser")).toHaveCount(0);
  await expect(page.getByLabel("Figma source")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send To Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send To Chat" }).click();
  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();

  expect(capturedRequests.length).toBe(1);
  const request = capturedRequests[0];
  expect(request.appGenerationMode).toBe("mcp_server");
  const message = request.message as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textContent = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  expect(textContent).toContain("App generation mode: mcp_server");
  expect(textContent).toContain(
    "Generate using MCP tools and persist app spec.",
  );
});
