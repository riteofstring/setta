import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
  seedLocalStorage,
} from "../../helpers";

test("app spec patch streaming updates the app preview incrementally", async ({
  page,
}) => {
  const title1 = `Streaming One ${Date.now()}`;
  const title2 = `Streaming Two ${Date.now()}`;

  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appSpecStreamingEnabled: true,
  });
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

  const chatId = `pw-chat-${Date.now()}`;
  const sectionId = `pw-section-${Date.now()}`;
  const toolCallId = `pw-tool-${Date.now()}`;

  const patch1 = {
    op: "set",
    path: "/elements/stream-root",
    value: {
      key: "stream-root",
      type: "Card",
      props: {
        title: title1,
        description: "First streaming patch.",
      },
      children: [],
    },
  };
  const patch2 = { op: "set", path: "/root", value: "stream-root" };

  await postBackend<null>(page, "/emitChatStreamDelta", {
    projectConfigId,
    sectionId,
    chatId,
    chunk: {
      type: "tool_argument_preview_delta",
      message_id: `pw-msg-${Date.now()}`,
      tool_call_id: toolCallId,
      tool_name: "setta__stream_app_definition",
      arguments_delta: "",
      preview_kind: "appSpecPatch",
      target_ids_by_type: {},
      preview_value_delta: `${JSON.stringify(patch1)}\n${JSON.stringify(patch2)}\n`,
    },
  });

  await expect(page.getByText("First streaming patch.")).toBeVisible({
    timeout: 10000,
  });

  const patch3 = {
    op: "set",
    path: "/elements/stream-root/props",
    value: {
      title: title2,
      description: "Second streaming patch.",
    },
  };

  await postBackend<null>(page, "/emitChatStreamDelta", {
    projectConfigId,
    sectionId,
    chatId,
    chunk: {
      type: "tool_argument_preview_delta",
      message_id: `pw-msg-${Date.now()}`,
      tool_call_id: toolCallId,
      tool_name: "setta__stream_app_definition",
      arguments_delta: "",
      preview_kind: "appSpecPatch",
      target_ids_by_type: {},
      preview_value_delta: `${JSON.stringify(patch3)}\n`,
    },
  });

  await expect(page.getByText("Second streaming patch.")).toBeVisible({
    timeout: 10000,
  });

  const finalSpec = {
    root: "stream-root",
    elements: {
      "stream-root": {
        key: "stream-root",
        type: "Card",
        props: {
          title: title2,
          description: "Second streaming patch.",
        },
        children: [],
      },
    },
  };

  await postBackend<null>(page, "/emitChatStreamDelta", {
    projectConfigId,
    sectionId,
    chatId,
    chunk: {
      type: "tool_result",
      result: {
        role: "tool",
        tool_call_id: toolCallId,
        tool_name: "setta__stream_app_definition",
        arguments: { patches: "..." },
        result: {
          meta: null,
          content: [],
          structuredContent: {
            appSpec: finalSpec,
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

  await expect(page.getByRole("heading", { name: title2 })).toBeVisible({
    timeout: 10000,
  });
});
