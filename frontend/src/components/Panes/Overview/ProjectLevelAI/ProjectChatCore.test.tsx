/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";
import { describe, expect, it } from "vitest";

import {
  buildProjectChatHydrationCacheKey,
  clearProjectChatHydrationCacheEntriesForChat,
  resolveProjectChatSubmitAppGeneration,
} from "./ProjectChatCore";

type HydrationCacheEntry = {
  attempt: number;
  lastTouchedAt: number;
  status: "failed" | "succeeded" | "terminal_failure";
  timerId: number | null;
};

function createEntry(
  status: HydrationCacheEntry["status"],
): HydrationCacheEntry {
  return {
    attempt: 0,
    lastTouchedAt: 0,
    status,
    timerId: null,
  };
}

describe("ProjectChatCore hydration cache identity", () => {
  it("changes the hydration cache key when only the project config changes", () => {
    const projectAKey = buildProjectChatHydrationCacheKey({
      projectConfigId: "project-a",
      chatId: "shared-chat",
      hydrationRunType: "llm_chat",
      hydrationMetadataRevision: "revision-1",
    });
    const projectBKey = buildProjectChatHydrationCacheKey({
      projectConfigId: "project-b",
      chatId: "shared-chat",
      hydrationRunType: "llm_chat",
      hydrationMetadataRevision: "revision-1",
    });

    expect(projectAKey).not.toBeNull();
    expect(projectBKey).not.toBeNull();
    expect(projectAKey).not.toBe(projectBKey);
  });

  it("only evicts cache entries for the same project-owned route identity", () => {
    const cache: Record<string, HydrationCacheEntry> = {
      "project-a:shared-chat:llm_chat:revision-1":
        createEntry("terminal_failure"),
      "project-a:shared-chat:external_agent:revision-1": createEntry("failed"),
      "project-b:shared-chat:llm_chat:revision-1": createEntry("succeeded"),
      "project-a:other-chat:llm_chat:revision-1": createEntry("succeeded"),
    };

    const removed = clearProjectChatHydrationCacheEntriesForChat({
      cache,
      projectConfigId: "project-a",
      chatId: "shared-chat",
      keepCacheKey: "project-a:shared-chat:llm_chat:revision-1",
    });

    expect(removed).toEqual([
      "project-a:shared-chat:external_agent:revision-1",
    ]);
  });
});

describe("ProjectChatCore submit app-generation resolution", () => {
  it("keeps inheriting the active app-generation mode when no override is provided", () => {
    expect(
      resolveProjectChatSubmitAppGeneration({
        activeAppGeneration: { mode: "json_render" },
      }),
    ).toEqual({ mode: "json_render" });
  });

  it("treats an explicit null override as plain chat instead of inheriting", () => {
    expect(
      resolveProjectChatSubmitAppGeneration({
        activeAppGeneration: { mode: "json_render" },
        options: {
          appGeneration: null,
        },
      }),
    ).toBeNull();
  });
});
