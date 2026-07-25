import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";
import { EasyButtonProjectionSurface, easyButtonProjectionView } from "./easy-button-surface";

describe("Easy Button folder resource request surface", () => {
  test("keeps folderless conversations writable while requesting a folder resource", () => {
    const commands = folderResourceRequestCommands();
    const view = easyButtonProjectionView("conversation_folderless", undefined);
    const html = renderToString(<EasyButtonProjectionSurface commands={commands} view={view} />);
    const input = html.match(/<input[^>]*data-testid="easy-button-input"[^>]*>/)?.[0] ?? "";

    expect(view.workspaceId).toBeNull();
    expect(html).toContain('data-testid="easy-button-folder-resource"');
    expect(html).toContain("Choose folder");
    expect(html).not.toContain("Conversation commands are unavailable");
    expect(input).not.toContain("disabled");
  });
});

function folderResourceRequestCommands(): EasyButtonConversationCommands {
  return {
    available: false,
    canSubmit: false,
    clarificationQuestion: null,
    discardFailedInput: vi.fn(),
    disposeSide: vi.fn(),
    error: null,
    folderResourceRequest: { chooseFolder: vi.fn() },
    input: "",
    inputAvailable: true,
    pending: false,
    pendingAcceptedInput: null,
    presentRelatedConversation: vi.fn(),
    requestVoiceCapture: undefined,
    retryFailedInput: vi.fn(),
    routingFailure: null,
    sendSide: vi.fn(async () => false),
    setInput: vi.fn(),
    stop: vi.fn(),
    submit: vi.fn(),
    submitApproval: vi.fn(),
  };
}
