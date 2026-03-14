import { describe, expect, it } from "vitest";
import { shouldExitManagedChatHistory } from "./ChatArea";

describe("shouldExitManagedChatHistory", () => {
  it("closes history when the managed chat binding changes", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-before",
        nextChatId: "chat-after",
        previousWaitingForResponse: false,
        nextWaitingForResponse: false,
      }),
    ).toBe(true);
  });

  it("closes history when the current managed chat starts a new response", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-current",
        nextChatId: "chat-current",
        previousWaitingForResponse: false,
        nextWaitingForResponse: true,
      }),
    ).toBe(true);
  });

  it("keeps history open when there is no new external chat activity", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-current",
        nextChatId: "chat-current",
        previousWaitingForResponse: true,
        nextWaitingForResponse: true,
      }),
    ).toBe(false);
  });
});
