import { useAIFollow } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAIFollowToolArgumentsForChat,
  getAIFollowToolArgumentsSnapshot,
  receiveAIFollowToolArgumentsUpdate,
  requestAIFollowSnapshot,
  restoreAIFollowToolArgumentsSnapshot,
} from "./aiFollowToolArguments";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_ai_follow_snapshot: vi.fn(),
  };
});

describe("aiFollowToolArguments", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("stores and clones tool argument snapshots by project and chat", () => {
    receiveAIFollowToolArgumentsUpdate({
      projectConfigId: "project-1",
      chatId: "chat-1",
      idsByType: {
        section: ["section-1"],
      },
    });

    const snapshot = getAIFollowToolArgumentsSnapshot("project-1", "chat-1");
    expect(snapshot).toEqual({
      section: ["section-1"],
    });

    snapshot?.section.push("section-2");

    expect(getAIFollowToolArgumentsSnapshot("project-1", "chat-1")).toEqual({
      section: ["section-1"],
    });
  });

  it("clears and restores tool argument snapshots for a chat", () => {
    useAIFollow.setState((state) => {
      state.toolArgumentsIdsByProjectConfigId = {
        "project-1": {
          "chat-1": {
            section: ["section-1"],
          },
        },
      };
    });

    clearAIFollowToolArgumentsForChat("project-1", "chat-1");
    expect(getAIFollowToolArgumentsSnapshot("project-1", "chat-1")).toBeNull();

    restoreAIFollowToolArgumentsSnapshot({
      projectConfigId: "project-1",
      chatId: "chat-1",
      idsByType: {
        section: ["section-1"],
      },
    });
    expect(getAIFollowToolArgumentsSnapshot("project-1", "chat-1")).toEqual({
      section: ["section-1"],
    });
  });

  it("hydrates the store from the backend follow snapshot payload", async () => {
    const { route_get_ai_follow_snapshot } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_ai_follow_snapshot).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        {
          projectConfigId: "project-1",
          chatId: "chat-1",
          idsByType: {
            section: ["section-1"],
          },
        },
        {
          projectConfigId: "project-1",
          chatId: "chat-2",
          idsByType: {
            section: ["section-2"],
          },
        },
      ],
    });

    await requestAIFollowSnapshot("project-1");

    expect(route_get_ai_follow_snapshot).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(getAIFollowToolArgumentsSnapshot("project-1", "chat-1")).toEqual({
      section: ["section-1"],
    });
    expect(getAIFollowToolArgumentsSnapshot("project-1", "chat-2")).toEqual({
      section: ["section-2"],
    });
  });
});
