import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
  seedLocalStorage,
} from "../../helpers";

test("ai tool results can update the app spec without copy/paste", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(
    page.getByRole("heading", { name: "JSON Render" }),
  ).toBeVisible();

  const projectConfigId = await getCurrentProjectConfigId(page);

  const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
  if (await showPreviewButton.isVisible()) {
    await showPreviewButton.click();
  }
  await expect(page.getByText("App Preview")).toBeVisible();

  const title = `AI Generated ${Date.now()}`;
  const appSpec = {
    root: {
      key: "app-root",
      type: "Card",
      props: {
        title,
        description: "Generated via tool call.",
      },
      children: [],
    },
    elements: {
      "app-root": {
        key: "app-root",
        type: "Card",
        props: {
          title,
          description: "Generated via tool call.",
        },
        children: [],
      },
    },
  };

  await postBackend<null>(page, "/emitChatStreamDelta", {
    projectConfigId,
    sectionId: `pw-section-${Date.now()}`,
    chatId: `pw-chat-${Date.now()}`,
    chunk: {
      type: "tool_result",
      result: {
        role: "tool",
        tool_call_id: `pw-tool-${Date.now()}`,
        tool_name: "setta__set_app_definition",
        arguments: { appSpec },
        result: {
          meta: null,
          content: [],
          structuredContent: {
            appSpec,
            appDefinition: {
              catalogId: "setta.app.default",
              appSpecVersion: "v1",
              appSpecPath: "app_specs/app.json",
              routes: [],
              dataBindings: {},
              actions: {},
              theme: null,
              assets: [],
            },
          },
          isError: false,
        },
        content: [],
        is_error: false,
      },
    },
  });

  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 10000,
  });
});
