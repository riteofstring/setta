/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeManagedChatSlashCommand,
  type ChatSlashCommandDefinition,
} from "./chatComposerControls";
import { ChatInput } from "./ChatInput";
import {
  APP_GENERATION_COMMANDS,
  createDeferredPromise,
  getAppGenerationPrompt,
  getComposerElements,
  setTextareaValue,
} from "./ChatInput.submit.testHelpers";

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

  it("keeps queued /app-json drafts blocked with a provider-required message once app commands disappear", async () => {
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

    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      "/app-json requires an active app subsystem provider with app-generation chat-mode support.",
    );
    const queuedDraft = host.querySelector('[data-chat-queued-draft="true"]');
    expect(queuedDraft?.textContent).toContain(
      "/app-json dashboard for support ops",
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
      "Attach at least one image before using /app-image.",
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
              requiresImageAttachment: true,
            },
          ]}
          recognizedSlashCommands={[
            {
              command: "/wireframe",
              action: "custom_prompt",
              summary: "Generate from an attached reference image.",
              promptTemplate: "Match the attached design.",
              appGenerationMode: "json_render_with_image",
              requiresImageAttachment: true,
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
      requiresImageAttachment: true,
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
      "Attach at least one image before using /wireframe.",
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

  it("keeps queued custom app-generation slash commands queued when the command is removed before replay", async () => {
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
      "/wireframe requires an active app subsystem provider with app-generation chat-mode support.",
    );
    expect(
      host.querySelector('[data-chat-queued-draft="true"]')?.textContent,
    ).toContain("/wireframe support ops");
  });

  it("replays queued custom slash commands against the refreshed registry definition", async () => {
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
      appGenerationMode: "wireframe_v2",
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
      "Draft the edited wireframe.\n\nsupport ops",
      [],
      {
        appGeneration: {
          mode: "wireframe_v2",
        },
      },
    );
  });

  it("replays queued custom slash commands with refreshed image requirements", async () => {
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
      promptTemplate: "Draft a wireframe.",
      appGenerationMode: "json_render",
    };
    const editedCommand: ChatSlashCommandDefinition = {
      ...initialCommand,
      requiresImageAttachment: true,
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

    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      "Attach at least one image before using /wireframe.",
    );
    expect(
      host.querySelector('[data-chat-queued-draft="true"]')?.textContent,
    ).toContain("/wireframe support ops");
  });
});
