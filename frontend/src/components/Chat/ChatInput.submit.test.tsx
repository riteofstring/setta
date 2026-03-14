/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildChatSlashCommands,
  executeManagedChatSlashCommand,
} from "./chatComposerControls";
import { ChatInput } from "./ChatInput";

const APP_GENERATION_COMMANDS = buildChatSlashCommands({
  appGenerationModes: true,
});

describe("ChatInput queued slash-command replay", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("replays queued /app-json submissions through the app-generation submit path", async () => {
    const onSubmit = vi.fn(async () => true);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();

    const App = () => {
      const [waitingForResponse, setWaitingForResponse] = useState(true);

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={APP_GENERATION_COMMANDS}
          recognizedSlashCommands={APP_GENERATION_COMMANDS}
          onSubmit={onSubmit}
          onStop={() => {
            setWaitingForResponse(false);
          }}
          onSlashCommand={(command) =>
            executeManagedChatSlashCommand({
              command,
              slashCommands: APP_GENERATION_COMMANDS,
              onStartNewChat,
              onResumeLatestChat,
              resumeFeedback: {
                success: "resumed",
                notFound: "not found",
              },
              onSetPermissionMode,
              searchEnabled: true,
              onSetSearchEnabled,
              modelFeedback: "Use the model selector.",
            })
          }
        />
      );
    };

    await act(async () => {
      root.render(<App />);
    });

    const textarea = host.querySelector(
      '[data-testid="chat-input-textarea"]',
    ) as HTMLTextAreaElement | null;
    const submitButton = host.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null;
    if (!textarea || !submitButton) {
      throw new Error("Expected chat input controls.");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("Expected textarea value setter.");
      }
      valueSetter.call(textarea, "/app-json dashboard for support ops");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      [
        "Generate a polished standalone JSON-render app spec.",
        "Use a strong hero section, clear content grouping, and consistent spacing/typography by default.",
        "Include one obvious primary action path and production-ready baseline structure.",
      ].join(" ") + "\n\ndashboard for support ops",
      [],
      {
        appGeneration: {
          mode: "json_render",
          referenceImageUrl: null,
          referenceImageNotes: null,
        },
      },
    );
  });
});
