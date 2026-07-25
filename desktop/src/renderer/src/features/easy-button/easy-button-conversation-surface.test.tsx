import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { useConversationStore } from "../../stores/conversation-store";
import { EasyButtonSurface } from "./easy-button-conversation-surface";

const workspaceId = "workspace_topic";

describe("Easy Button conversation surface workspace context", () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  test("reports an unloaded bound pane without reading selected-workspace state", () => {
    const unloaded = renderToString(<EasyButtonSurface conversationId="conversation_unloaded" />);

    expect(unloaded).toContain('data-conversation-id="conversation_unloaded"');
    expect(unloaded).toContain('data-easy-button-projection="unloaded"');
    expect(unloaded).toContain("Conversation projection is not loaded");
  });

  test("requests a folder for an explicitly folderless pane even when a workspace is selected", () => {
    const folderless = renderToString(
      <EasyButtonSurface
        conversationId="conversation_folderless"
        paneId="pane_folderless"
        resourceBindings={[]}
        workspaceId={workspaceId}
      />,
    );
    const input = folderless.match(/<input[^>]*data-testid="easy-button-input"[^>]*>/)?.[0] ?? "";

    expect(folderless).toContain('data-conversation-id="conversation_folderless"');
    expect(folderless).toContain('data-easy-button-projection="unloaded"');
    expect(folderless).toContain('data-testid="easy-button-folder-resource"');
    expect(folderless).toContain("Choose folder");
    expect(folderless).not.toContain("Conversation commands are unavailable");
    expect(input).not.toContain("disabled");
  });
});
