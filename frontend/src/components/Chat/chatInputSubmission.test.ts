import { describe, expect, it } from "vitest";

import { type ChatSlashCommandDefinition } from "./chatComposerControls";
import {
  cycleQueuedDraftSelection,
  cycleSubmittedMessageHistorySelection,
  enqueueQueuedDraft,
  resolveCustomPromptSlashCommandSubmission,
  resolveSlashCommandRequest,
  type QueuedChatDraft,
} from "./chatInputSubmission";

function buildQueuedDraft(
  id: string,
  message: string,
  queuedAtMs: number,
): QueuedChatDraft {
  return {
    id,
    message,
    attachments: [],
    replaySnapshot: {
      kind: "plain_message",
    },
    queuedAtMs,
    replayState: "ready",
    lastAutoReplayVersion: null,
  };
}

describe("resolveSlashCommandRequest", () => {
  it("recognizes unavailable managed slash commands without treating them as chat text", () => {
    const availableCommands: ChatSlashCommandDefinition[] = [
      {
        command: "/new",
        action: "new",
        summary: "Start a new chat thread.",
      },
      {
        command: "/help",
        action: "help",
        summary: "Show slash command help.",
      },
    ];
    const recognizedCommands: ChatSlashCommandDefinition[] = [
      ...availableCommands,
      {
        command: "/permissions",
        action: "permissions",
        summary: "Set permissions mode: minimal, yolo, or config_toml_custom.",
      },
    ];

    const resolved = resolveSlashCommandRequest({
      message: "/permissions yolo",
      slashCommands: availableCommands,
      recognizedSlashCommands: recognizedCommands,
    });

    expect(resolved.parsed?.command).toBe("/permissions");
    expect(resolved.commandAvailable).toBe(false);
  });

  it("recognizes reserved native slash commands even when they are unavailable", () => {
    const recognizedCommands: ChatSlashCommandDefinition[] = [
      {
        command: "/deploy",
        action: "custom_prompt",
        summary: "Deploy the current build.",
        promptTemplate: "Deploy the current build.",
      },
    ];

    const resolved = resolveSlashCommandRequest({
      message: "/deploy now",
      slashCommands: [],
      recognizedSlashCommands: recognizedCommands,
    });

    expect(resolved.parsed?.command).toBe("/deploy");
    expect(resolved.commandAvailable).toBe(false);
    expect(resolved.parsed?.rawSuffix).toBe("now");
  });

  it("treats native slash commands as available once the executable command set includes them", () => {
    const nativeCommands: ChatSlashCommandDefinition[] = [
      {
        command: "/deploy",
        action: "native_prompt",
        summary: "Submit the native deploy command verbatim.",
      },
    ];

    const resolved = resolveSlashCommandRequest({
      message: "/deploy now",
      slashCommands: nativeCommands,
      recognizedSlashCommands: nativeCommands,
    });

    expect(resolved.parsed?.command).toBe("/deploy");
    expect(resolved.parsed?.action).toBe("native_prompt");
    expect(resolved.commandAvailable).toBe(true);
  });
});

describe("resolveCustomPromptSlashCommandSubmission", () => {
  it("preserves attachments for custom prompt submissions", () => {
    const attachments = [
      {
        id: "artifact-1",
        name: "release-notes.md",
        mimeType: "text/markdown",
        size: 128,
      },
    ];
    const submission = resolveCustomPromptSlashCommandSubmission({
      promptTemplate: "Summarize the attached artifact.",
      args: ["for", "release"],
      rawSuffix: "for release",
      attachments,
    });

    expect(submission).toEqual({
      message: "Summarize the attached artifact.\n\nfor release",
      attachments: [
        {
          id: "artifact-1",
          name: "release-notes.md",
          mimeType: "text/markdown",
          size: 128,
        },
      ],
    });
    expect(submission?.attachments).not.toBe(attachments);
  });

  it("returns null when the custom prompt template is empty", () => {
    const submission = resolveCustomPromptSlashCommandSubmission({
      promptTemplate: "   ",
      args: [],
      rawSuffix: "",
      attachments: [],
    });

    expect(submission).toBeNull();
  });

  it("preserves exact multiline custom prompt suffix text", () => {
    const submission = resolveCustomPromptSlashCommandSubmission({
      promptTemplate: "Ship the current build.",
      args: ["first", "line", "second", "line"],
      rawSuffix: "first line\n\n  second line",
      attachments: [
        {
          id: "artifact-2",
          name: "deploy-notes.md",
          mimeType: "text/markdown",
          size: 64,
        },
      ],
    });

    expect(submission).toEqual({
      message: "Ship the current build.\n\nfirst line\n\n  second line",
      attachments: [
        {
          id: "artifact-2",
          name: "deploy-notes.md",
          mimeType: "text/markdown",
          size: 64,
        },
      ],
    });
  });
});

describe("queued draft helpers", () => {
  const draftA = buildQueuedDraft("queued-a", "First queued message", 1);
  const draftB = buildQueuedDraft("queued-b", "Second queued message", 2);

  it("adds prioritized drafts at the front of the queue", () => {
    const queue = enqueueQueuedDraft([draftA], draftB, true);
    expect(queue.map((draft) => draft.id)).toEqual(["queued-b", "queued-a"]);
  });

  it("adds non-prioritized drafts at the end of the queue", () => {
    const queue = enqueueQueuedDraft([draftA], draftB, false);
    expect(queue.map((draft) => draft.id)).toEqual(["queued-a", "queued-b"]);
  });

  it("cycles queue selection forward and backward", () => {
    const queue = [draftA, draftB];
    expect(cycleQueuedDraftSelection(queue, null, "next")).toBe("queued-a");
    expect(cycleQueuedDraftSelection(queue, "queued-a", "next")).toBe(
      "queued-b",
    );
    expect(cycleQueuedDraftSelection(queue, "queued-b", "next")).toBe(
      "queued-a",
    );
    expect(cycleQueuedDraftSelection(queue, "queued-a", "prev")).toBe(
      "queued-b",
    );
  });
});

describe("submitted message history helpers", () => {
  it("starts selection at the newest message when no selection exists", () => {
    // Arrow history should always begin at the newest entry.
    const history = ["Most recent", "Older", "Oldest"];
    expect(cycleSubmittedMessageHistorySelection(history, null, "prev")).toBe(
      0,
    );
    expect(cycleSubmittedMessageHistorySelection(history, null, "next")).toBe(
      0,
    );
  });

  it("cycles backward and forward through history entries", () => {
    // Up/down traversal should wrap to keep cycling through available prompts.
    const history = ["Most recent", "Older", "Oldest"];
    expect(cycleSubmittedMessageHistorySelection(history, 0, "prev")).toBe(2);
    expect(cycleSubmittedMessageHistorySelection(history, 2, "next")).toBe(0);
    expect(cycleSubmittedMessageHistorySelection(history, 1, "prev")).toBe(0);
    expect(cycleSubmittedMessageHistorySelection(history, 1, "next")).toBe(2);
  });

  it("returns null when history is empty", () => {
    expect(cycleSubmittedMessageHistorySelection([], null, "prev")).toBeNull();
    expect(cycleSubmittedMessageHistorySelection([], 0, "next")).toBeNull();
  });
});
