import { describe, expect, it, vi } from "vitest";
import {
  clearProjectChatHydrationRetryTimer,
  resolveProjectChatHydrationControllerCacheKey,
} from "./projectChatRuntimeController";

describe("projectChatRuntimeController", () => {
  it("uses a provenance-probe cache key when hydration retries missing provenance", () => {
    const cacheKey = resolveProjectChatHydrationControllerCacheKey({
      projectConfigId: "project-1",
      chatId: "chat-1",
      hydrationAuthority: {
        hydrationRunType: "external_agent",
        blockedErrorCode: "chat_provenance_missing",
      },
      hydrationMetadataRevision: "rev-1",
    });

    expect(cacheKey).toBe("project-1:chat-1:chat_provenance_probe:rev-1");
  });

  it("returns null when hydration is unresolved and no provenance probe is required", () => {
    const cacheKey = resolveProjectChatHydrationControllerCacheKey({
      projectConfigId: "project-1",
      chatId: "chat-1",
      hydrationAuthority: {
        hydrationRunType: null,
        blockedErrorCode: null,
      },
      hydrationMetadataRevision: "rev-1",
    });

    expect(cacheKey).toBeNull();
  });

  it("clears scheduled hydration retry timers and marks them failed", () => {
    vi.useFakeTimers();
    const timerId = globalThis.setTimeout(() => undefined, 1000);
    const cache = {
      "project-1:chat-1:llm_chat:rev-1": {
        status: "retry_scheduled" as const,
        timerId,
        attempt: 1,
        lastTouchedAt: 0,
      },
    };

    clearProjectChatHydrationRetryTimer({
      cache,
      cacheKey: "project-1:chat-1:llm_chat:rev-1",
    });

    expect(cache["project-1:chat-1:llm_chat:rev-1"]).toEqual(
      expect.objectContaining({
        status: "failed",
        timerId: null,
      }),
    );
    vi.useRealTimers();
  });
});
