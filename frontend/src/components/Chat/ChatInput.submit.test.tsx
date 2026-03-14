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
        },
      },
    );
  });

  it("restores a queued slash-command draft when replayed submit fails", async () => {
    const onSubmit = vi.fn(async () => false);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      setWaitingForResponse = setLocalWaitingForResponse;

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
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setTextareaValue) {
      throw new Error("Expected textarea value setter.");
    }

    await act(async () => {
      setTextareaValue.call(textarea, "/app-json dashboard for support ops");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!setWaitingForResponse) {
      throw new Error("Expected waiting state setter.");
    }
    await act(async () => {
      setWaitingForResponse(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    const queuedDraft = host.querySelector('[data-chat-queued-draft="true"]');
    expect(queuedDraft?.textContent).toContain(
      "/app-json dashboard for support ops",
    );
    expect(host.textContent).toContain("Failed to submit /app-json.");
  });

  it("passes an explicit plain-chat override for custom slash commands", async () => {
    const onSubmit = vi.fn(async () => true);

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          slashCommands={[
            {
              command: "/plain-review",
              action: "custom_prompt",
              summary: "Review without app generation.",
              promptTemplate: "Review the current diff.",
              appGenerationMode: null,
            },
          ]}
          recognizedSlashCommands={[
            {
              command: "/plain-review",
              action: "custom_prompt",
              summary: "Review without app generation.",
              promptTemplate: "Review the current diff.",
              appGenerationMode: null,
            },
          ]}
          onSubmit={onSubmit}
        />,
      );
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
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setTextareaValue) {
      throw new Error("Expected textarea value setter.");
    }

    await act(async () => {
      setTextareaValue.call(textarea, "/plain-review changes in auth flow");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      "Review the current diff.\n\nchanges in auth flow",
      [],
      {
        appGeneration: null,
      },
    );
  });

  it("keeps queued unavailable slash commands queued until they are executable", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      setWaitingForResponse = setLocalWaitingForResponse;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={[]}
          recognizedSlashCommands={[
            {
              command: "/deploy",
              action: "native_prompt",
              summary: "Deploy the current build.",
            },
          ]}
          onSubmit={onSubmit}
          onStop={() => {
            setWaitingForResponse(false);
          }}
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
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setTextareaValue) {
      throw new Error("Expected textarea value setter.");
    }

    await act(async () => {
      setTextareaValue.call(textarea, "/deploy now");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!setWaitingForResponse) {
      throw new Error("Expected waiting state setter.");
    }
    await act(async () => {
      setWaitingForResponse(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      "/deploy is unavailable in the current context. Use /help.",
    );
    const queuedDraft = host.querySelector('[data-chat-queued-draft="true"]');
    expect(queuedDraft?.textContent).toContain("/deploy now");
  });

  it("keeps queued slash commands when authority reload asks to retry later", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      setWaitingForResponse = setLocalWaitingForResponse;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          onSubmit={onSubmit}
          onStop={() => {
            setWaitingForResponse(false);
          }}
          onUnknownSlashCommand={() => ({
            handled: true,
            feedback: "Reloading slash-command authority.",
            keepInput: true,
            retryLater: true,
          })}
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
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setTextareaValue) {
      throw new Error("Expected textarea value setter.");
    }

    await act(async () => {
      setTextareaValue.call(textarea, "/reload-authority");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!setWaitingForResponse) {
      throw new Error("Expected waiting state setter.");
    }
    await act(async () => {
      setWaitingForResponse(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Reloading slash-command authority.");
    const queuedDraft = host.querySelector('[data-chat-queued-draft="true"]');
    expect(queuedDraft?.textContent).toContain("/reload-authority");
  });
});
