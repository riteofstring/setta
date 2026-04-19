/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildChatSlashCommands,
  executeManagedChatSlashCommand,
  type ChatSlashCommandDefinition,
} from "./chatComposerControls";
import { ChatInput } from "./ChatInput";

const APP_GENERATION_COMMANDS = buildChatSlashCommands({
  appGenerationModes: true,
});

function getAppGenerationPrompt(command: string): string {
  const entry = APP_GENERATION_COMMANDS.find(
    (slashCommand) => slashCommand.command === command,
  );
  if (!entry?.promptTemplate) {
    throw new Error(`Missing app generation prompt for ${command}.`);
  }
  return entry.promptTemplate;
}

function getComposerElements(host: HTMLDivElement): {
  textarea: HTMLTextAreaElement;
  submitButton: HTMLButtonElement;
} {
  const textarea = host.querySelector(
    '[data-testid="chat-input-textarea"]',
  ) as HTMLTextAreaElement | null;
  const submitButton = host.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement | null;
  if (!textarea || !submitButton) {
    throw new Error("Expected chat input controls.");
  }
  return { textarea, submitButton };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (!valueSetter) {
    throw new Error("Expected textarea value setter.");
  }
  valueSetter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  if (!resolve) {
    throw new Error("Expected deferred promise resolver.");
  }
  return { promise, resolve };
}

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

  it("replays queued /app-json drafts from the original snapshot even if the command list changes", async () => {
    const onSubmit = vi.fn(async () => true);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setSlashCommands:
      | ((next: ChatSlashCommandDefinition[]) => void)
      | null = null;

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [slashCommands, setLocalSlashCommands] = useState(
        APP_GENERATION_COMMANDS,
      );
      setWaitingForResponse = setLocalWaitingForResponse;
      setSlashCommands = setLocalSlashCommands;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={slashCommands}
          recognizedSlashCommands={slashCommands}
          onSubmit={onSubmit}
          onStop={() => {}}
          onSlashCommand={(command) =>
            executeManagedChatSlashCommand({
              command,
              slashCommands,
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

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/app-json dashboard for support ops");
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!setSlashCommands) {
      throw new Error("Expected slash command setter.");
    }
    await act(async () => {
      setSlashCommands([]);
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

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      `${getAppGenerationPrompt("/app-json")}\n\ndashboard for support ops`,
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

  it("restores the original slash-command draft when async submission fails", async () => {
    const deferredSubmit = createDeferredPromise<boolean>();
    const onSubmit = vi.fn(() => deferredSubmit.promise);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          slashCommands={APP_GENERATION_COMMANDS}
          recognizedSlashCommands={APP_GENERATION_COMMANDS}
          onSubmit={onSubmit}
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
        />,
      );
    });

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/app-json support dashboard");
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textarea.value).toBe("");

    deferredSubmit.resolve(false);

    await act(async () => {
      await deferredSubmit.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textarea.value).toBe("/app-json support dashboard");
  });

  it("blocks /app-image until an image attachment is present", async () => {
    const onSubmit = vi.fn(async () => true);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          slashCommands={APP_GENERATION_COMMANDS}
          recognizedSlashCommands={APP_GENERATION_COMMANDS}
          onSubmit={onSubmit}
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
      setTextareaValue.call(textarea, "/app-image landing page");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      "Attach at least one image before using /app-image.",
    );
  });

  it("allows /app-image without a new upload when the chat already retains an image", async () => {
    const onSubmit = vi.fn(async () => true);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          hasRetainedImageAttachmentForImageMode
          slashCommands={APP_GENERATION_COMMANDS}
          recognizedSlashCommands={APP_GENERATION_COMMANDS}
          onSubmit={onSubmit}
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
      setTextareaValue.call(textarea, "/app-image landing page");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      `${getAppGenerationPrompt("/app-image")}\n\nlanding page`,
      [],
      {
        appGeneration: {
          mode: "json_render_with_image",
        },
      },
    );
    expect(host.textContent).not.toContain(
      "Attach at least one image before using /app-image.",
    );
  });

  it("leaves queued /app-image drafts in a manual-edit state when replay fails image validation", async () => {
    const onSubmit = vi.fn(async () => true);
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setSlashCommands:
      | ((next: ChatSlashCommandDefinition[]) => void)
      | null = null;

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [slashCommands, setLocalSlashCommands] = useState(
        APP_GENERATION_COMMANDS,
      );
      setWaitingForResponse = setLocalWaitingForResponse;
      setSlashCommands = setLocalSlashCommands;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={slashCommands}
          recognizedSlashCommands={slashCommands}
          onSubmit={onSubmit}
          onStop={() => {
            setWaitingForResponse(false);
          }}
          onSlashCommand={(command) =>
            executeManagedChatSlashCommand({
              command,
              slashCommands,
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

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/app-image landing page");
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
      "Queued message failed. Edit it and retry.",
    );
    expect(
      host.querySelector('[data-chat-queued-draft="true"]')?.textContent,
    ).toContain("/app-image landing page");

    if (!setSlashCommands) {
      throw new Error("Expected slash command setter.");
    }
    await act(async () => {
      setSlashCommands([]);
      await Promise.resolve();
      await Promise.resolve();
      setSlashCommands(APP_GENERATION_COMMANDS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-chat-queued-draft="true"]')?.textContent,
    ).toContain("/app-image landing page");
  });

  it("blocks custom image-mode slash commands until an image attachment is present", async () => {
    const onSubmit = vi.fn(async () => true);

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          slashCommands={[
            {
              command: "/wireframe",
              action: "custom_prompt",
              summary: "Generate from an attached reference image.",
              promptTemplate: "Match the attached design.",
              appGenerationMode: "json_render_with_image",
            },
          ]}
          recognizedSlashCommands={[
            {
              command: "/wireframe",
              action: "custom_prompt",
              summary: "Generate from an attached reference image.",
              promptTemplate: "Match the attached design.",
              appGenerationMode: "json_render_with_image",
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
      setTextareaValue.call(textarea, "/wireframe support ops");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton.click();
      await Promise.resolve();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      "Attach at least one image before using /wireframe.",
    );
  });

  it("leaves queued custom image-mode slash commands in a manual-edit state when replay fails image validation", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;

    const customCommand: ChatSlashCommandDefinition = {
      command: "/wireframe",
      action: "custom_prompt",
      summary: "Generate from an attached reference image.",
      promptTemplate: "Match the attached design.",
      appGenerationMode: "json_render_with_image",
    };

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      setWaitingForResponse = setLocalWaitingForResponse;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={[customCommand]}
          recognizedSlashCommands={[customCommand]}
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

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/wireframe support ops");
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
      "Queued message failed. Edit it and retry.",
    );
    expect(
      host.querySelector('[data-chat-queued-draft="true"]')?.textContent,
    ).toContain("/wireframe support ops");
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

  it("keeps queued custom slash commands queued when the command is removed before replay", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setSlashCommands:
      | ((next: ChatSlashCommandDefinition[]) => void)
      | null = null;

    const initialCommand: ChatSlashCommandDefinition = {
      command: "/wireframe",
      action: "custom_prompt",
      summary: "Generate a layout proposal.",
      promptTemplate: "Draft a polished wireframe.",
      appGenerationMode: "json_render",
    };

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [slashCommands, setLocalSlashCommands] = useState([initialCommand]);
      setWaitingForResponse = setLocalWaitingForResponse;
      setSlashCommands = setLocalSlashCommands;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={slashCommands}
          recognizedSlashCommands={slashCommands}
          onSubmit={onSubmit}
          onStop={() => {}}
        />
      );
    };

    await act(async () => {
      root.render(<App />);
    });

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/wireframe support ops");
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!setSlashCommands) {
      throw new Error("Expected slash command setter.");
    }
    await act(async () => {
      setSlashCommands([]);
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
      "/wireframe is unavailable in the current context. Use /help.",
    );
    expect(
      host.querySelector('[data-chat-queued-draft="true"]')?.textContent,
    ).toContain("/wireframe support ops");
  });

  it("replays queued custom slash commands with the original prompt snapshot", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setSlashCommands:
      | ((next: ChatSlashCommandDefinition[]) => void)
      | null = null;

    const initialCommand: ChatSlashCommandDefinition = {
      command: "/wireframe",
      action: "custom_prompt",
      summary: "Generate a layout proposal.",
      promptTemplate: "Draft the original wireframe.",
      appGenerationMode: "json_render",
    };
    const editedCommand: ChatSlashCommandDefinition = {
      ...initialCommand,
      promptTemplate: "Draft the edited wireframe.",
    };

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [slashCommands, setLocalSlashCommands] = useState([initialCommand]);
      setWaitingForResponse = setLocalWaitingForResponse;
      setSlashCommands = setLocalSlashCommands;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={slashCommands}
          recognizedSlashCommands={slashCommands}
          onSubmit={onSubmit}
          onStop={() => {}}
        />
      );
    };

    await act(async () => {
      root.render(<App />);
    });

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/wireframe support ops");
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!setSlashCommands) {
      throw new Error("Expected slash command setter.");
    }
    await act(async () => {
      setSlashCommands([editedCommand]);
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

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      "Draft the original wireframe.\n\nsupport ops",
      [],
      {
        appGeneration: {
          mode: "json_render",
        },
      },
    );
  });

  it("replays queued unavailable slash commands when they become executable", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setSlashCommands:
      | ((next: ChatSlashCommandDefinition[]) => void)
      | null = null;

    const recognizedSlashCommands: ChatSlashCommandDefinition[] = [
      {
        command: "/deploy",
        action: "native_prompt",
        appGenerationMode: null,
        summary: "Deploy the current build.",
      },
    ];

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [slashCommands, setLocalSlashCommands] = useState<
        ChatSlashCommandDefinition[]
      >([]);
      setWaitingForResponse = setLocalWaitingForResponse;
      setSlashCommands = setLocalSlashCommands;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={slashCommands}
          recognizedSlashCommands={recognizedSlashCommands}
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

    if (!setSlashCommands) {
      throw new Error("Expected slash command setter.");
    }
    await act(async () => {
      setSlashCommands(recognizedSlashCommands);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("/deploy now", [], {
      appGeneration: null,
    });
    expect(host.querySelector('[data-chat-queued-draft="true"]')).toBeNull();
  });

  it("replays queued slash commands after authority reload resolves retryLater", async () => {
    const onSubmit = vi.fn(async () => true);
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setAuthorityReady:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;

    const authorityCommand: ChatSlashCommandDefinition[] = [
      {
        command: "/reload-authority",
        action: "native_prompt",
        appGenerationMode: null,
        summary: "Refresh native command authority.",
      },
    ];

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [authorityReady, setLocalAuthorityReady] = useState(false);
      setWaitingForResponse = setLocalWaitingForResponse;
      setAuthorityReady = setLocalAuthorityReady;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={authorityReady ? authorityCommand : []}
          recognizedSlashCommands={authorityReady ? authorityCommand : []}
          onSubmit={onSubmit}
          onStop={() => {
            setWaitingForResponse(false);
          }}
          onUnknownSlashCommand={() =>
            authorityReady
              ? false
              : {
                  handled: true,
                  feedback: "Reloading slash-command authority.",
                  keepInput: true,
                  retryLater: true,
                }
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

    if (!setAuthorityReady) {
      throw new Error("Expected authority setter.");
    }
    await act(async () => {
      setAuthorityReady(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("/reload-authority", [], {
      appGeneration: null,
    });
    expect(host.querySelector('[data-chat-queued-draft="true"]')).toBeNull();
  });

  it("replays queued slash commands when submitReadinessKey changes after retry_later", async () => {
    const onSubmit = vi.fn(async () =>
      submitReadyState ? true : "retry_later",
    );
    let setWaitingForResponse:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let setSubmitReady:
      | ((next: boolean | ((current: boolean) => boolean)) => void)
      | null = null;
    let submitReadyState = false;

    const nativeCommand: ChatSlashCommandDefinition[] = [
      {
        command: "/deploy",
        action: "native_prompt",
        appGenerationMode: null,
        summary: "Deploy the current build.",
      },
    ];

    const App = () => {
      const [waitingForResponse, setLocalWaitingForResponse] = useState(true);
      const [submitReady, setLocalSubmitReady] = useState(false);
      setWaitingForResponse = setLocalWaitingForResponse;
      setSubmitReady = setLocalSubmitReady;
      submitReadyState = submitReady;

      return (
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={waitingForResponse}
          slashCommands={nativeCommand}
          recognizedSlashCommands={nativeCommand}
          submitReadinessKey={submitReady ? "ready" : "blocked"}
          onSubmit={onSubmit}
          onStop={() => {}}
        />
      );
    };

    await act(async () => {
      root.render(<App />);
    });

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "/deploy now");
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

    const callCountBeforeReady = onSubmit.mock.calls.length;
    expect(callCountBeforeReady).toBeGreaterThan(0);
    expect(
      host.querySelector('[data-chat-queued-draft="true"]'),
    ).not.toBeNull();

    if (!setSubmitReady) {
      throw new Error("Expected submit readiness setter.");
    }
    await act(async () => {
      setSubmitReady(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit.mock.calls.length).toBeGreaterThan(callCountBeforeReady);
    expect(onSubmit).toHaveBeenLastCalledWith("/deploy now", [], {
      appGeneration: null,
    });
    expect(host.querySelector('[data-chat-queued-draft="true"]')).toBeNull();
  });
});

describe("ChatInput plain-message submit", () => {
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

  it("clears the composer immediately while an async plain-message submit is pending", async () => {
    const deferredSubmit = createDeferredPromise<boolean>();
    const onSubmit = vi.fn(() => deferredSubmit.promise);

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          onSubmit={onSubmit}
        />,
      );
    });

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "Hello from chat");
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Hello from chat", [], undefined);
    expect(textarea.value).toBe("");

    deferredSubmit.resolve(true);

    await act(async () => {
      await deferredSubmit.promise;
      await Promise.resolve();
    });

    expect(textarea.value).toBe("");
  });

  it("restores the plain-message draft if the async submit fails", async () => {
    const deferredSubmit = createDeferredPromise<boolean>();
    const onSubmit = vi.fn(() => deferredSubmit.promise);

    await act(async () => {
      root.render(
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={false}
          onSubmit={onSubmit}
        />,
      );
    });

    const { textarea, submitButton } = getComposerElements(host);

    await act(async () => {
      setTextareaValue(textarea, "Retry this draft");
      submitButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textarea.value).toBe("");

    deferredSubmit.resolve(false);

    await act(async () => {
      await deferredSubmit.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textarea.value).toBe("Retry this draft");
  });
});
