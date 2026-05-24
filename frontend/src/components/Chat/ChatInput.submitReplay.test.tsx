/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatSlashCommandDefinition } from "./chatComposerControls";
import { ChatInput } from "./ChatInput";
import {
  createDeferredPromise,
  getComposerElements,
  setTextareaValue,
} from "./ChatInput.submit.testHelpers";

describe("ChatInput queued slash-command replay retry paths", () => {
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
