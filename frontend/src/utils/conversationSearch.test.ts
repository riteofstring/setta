import {
  createAgentRun,
  createAssistantChatMessage,
  createMessageTextContent,
  createMessageThinkingContent,
  createToolCall,
  createToolCallFunction,
  createToolChatMessage,
  createUserChatMessage,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildSearchableTextForMessage,
  buildSearchableTextForMessages,
  countConversationSearchTextMatches,
  extractRunMessagesForConversationSearch,
  findConversationSearchTextRanges,
  matchesConversationSearchText,
  tokenizeConversationSearchQuery,
} from "./conversationSearch";

describe("conversationSearch", () => {
  it("tokenizes search query into normalized terms", () => {
    expect(tokenizeConversationSearchQuery("  Alpha   BETA  ")).toEqual([
      "alpha",
      "beta",
    ]);
    expect(tokenizeConversationSearchQuery("queue queue alpha")).toEqual([
      "queue",
      "alpha",
    ]);
    expect(tokenizeConversationSearchQuery("")).toEqual([]);
  });

  it("matches text when every search term is present", () => {
    const terms = tokenizeConversationSearchQuery("alpha beta");
    expect(matchesConversationSearchText("beta ... alpha", terms)).toBe(true);
    expect(matchesConversationSearchText("alpha only", terms)).toBe(false);
  });

  it("counts canonical rendered matches only when every term exists", () => {
    const terms = tokenizeConversationSearchQuery("alpha beta");
    expect(
      countConversationSearchTextMatches("alpha beta alpha gamma beta", terms),
    ).toBe(4);
    expect(countConversationSearchTextMatches("alpha only", terms)).toBe(0);
    expect(countConversationSearchTextMatches("alpha alpha", [])).toBe(0);
  });

  it("deduplicates duplicate and overlapping query terms into canonical matches", () => {
    expect(
      countConversationSearchTextMatches(
        "queue queue",
        tokenizeConversationSearchQuery("queue queue"),
      ),
    ).toBe(2);
    expect(
      countConversationSearchTextMatches(
        "alphabet",
        tokenizeConversationSearchQuery("alpha alphabet"),
      ),
    ).toBe(1);
  });

  it("returns merged text ranges for all matched search terms", () => {
    const terms = tokenizeConversationSearchQuery("alpha beta");
    expect(
      findConversationSearchTextRanges("Alpha beta alphabet soup beta", terms),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 10 },
      { start: 11, end: 16 },
      { start: 25, end: 29 },
    ]);
    expect(findConversationSearchTextRanges("gamma", terms)).toEqual([]);
  });

  it("builds searchable text from visible message content and activity labels", () => {
    const message = createAssistantChatMessage({
      content: [
        createMessageTextContent({ text: "Visible response text" }),
        createMessageThinkingContent({
          thinking: "planning thought",
          summary: "summary line",
        }),
      ],
      tool_calls: [
        createToolCall({
          id: "tool-1",
          function: createToolCallFunction({
            name: "command_execution",
            arguments: { command: "ls" },
          }),
        }),
      ],
    });

    const text = buildSearchableTextForMessage(message);
    expect(text).toContain("Visible response text");
    expect(text).toContain("ls");
    expect(text).not.toContain("planning thought");
    expect(text).not.toContain("summary line");
  });

  it("excludes inline and fenced code from searchable markdown text", () => {
    const message = createAssistantChatMessage({
      content: [
        createMessageTextContent({
          text: "Visible alpha\n\n```ts\nalpha in code\n```\n`alpha inline`\nalpha outside",
        }),
      ],
    });

    const text = buildSearchableTextForMessage(message);

    expect(text).toContain("Visible alpha");
    expect(text).toContain("alpha outside");
    expect(text).not.toContain("alpha in code");
    expect(text).not.toContain("alpha inline");
    expect(
      countConversationSearchTextMatches(
        text,
        tokenizeConversationSearchQuery("alpha"),
      ),
    ).toBe(2);
  });

  it("builds searchable text across multiple messages", () => {
    const messages = [
      createUserChatMessage({
        content: [createMessageTextContent({ text: "First prompt" })],
      }),
      createToolChatMessage({
        tool_call_id: "tool-1",
        result: "tool output",
      }),
    ];

    const text = buildSearchableTextForMessages(messages);
    expect(text).toContain("First prompt");
    expect(text).not.toContain("tool output");
  });

  it("keeps attachment labels searchable", () => {
    const message = createUserChatMessage({
      content: [createMessageTextContent({ text: "First prompt" })],
      attachments: [
        {
          id: "attachment-1",
          name: "release-plan.md",
        },
      ],
    });

    const text = buildSearchableTextForMessage(message);

    expect(text).toContain("release-plan.md");
  });

  it("excludes markdown link destinations from searchable text", () => {
    const message = createAssistantChatMessage({
      content: [
        createMessageTextContent({
          text: "[Docs](https://internal.example.com/spec)",
        }),
      ],
    });

    const text = buildSearchableTextForMessage(message);

    expect(text).toContain("Docs");
    expect(text).not.toContain("internal.example.com");
  });

  it("excludes tool-call payload details that are not highlighted in the transcript", () => {
    const message = createAssistantChatMessage({
      content: [],
      tool_calls: [
        createToolCall({
          id: "tool-1",
          function: createToolCallFunction({
            name: "file_change",
            arguments: { path: "notes.txt", diff: "secret payload" },
          }),
        }),
      ],
    });

    const text = buildSearchableTextForMessage(message);

    expect(text).toContain("Edit notes.txt");
    expect(text).not.toContain("secret payload");
  });

  it("extracts run messages from outputs and falls back to inputs", () => {
    const outputMessage = createAssistantChatMessage({
      content: [createMessageTextContent({ text: "output message" })],
    });
    const inputMessage = createUserChatMessage({
      content: [createMessageTextContent({ text: "input message" })],
    });

    const outputRun = createAgentRun({
      outputs: { messages: [outputMessage] },
      inputs: { messages: [inputMessage] },
    });
    const inputRun = createAgentRun({
      outputs: {},
      inputs: { messages: [inputMessage] },
    });

    expect(extractRunMessagesForConversationSearch(outputRun)).toEqual([
      outputMessage,
    ]);
    expect(extractRunMessagesForConversationSearch(inputRun)).toEqual([
      inputMessage,
    ]);
  });
});
