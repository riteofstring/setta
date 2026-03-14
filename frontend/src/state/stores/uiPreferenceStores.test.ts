import { describe, expect, it } from "vitest";
import { useLocalStorage } from "./uiPreferenceStores";

describe("uiPreferenceStores", () => {
  it("sanitizes transient and malformed persisted preference state", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      {
        darkMode: false,
        watchCodePortalOpen: true,
        projectChatAuxViewByProjectConfigId: {
          "project-a": "skills",
        },
        customProjectChatSlashCommandsByProjectConfigId: {
          "project-a": [
            { command: "/trim", prompt: "  Trim this.  " },
            { command: " ", prompt: "ignored" },
          ],
        },
        projectChatDraftMessageByProjectConfigId: {
          "project-a": "Unsaved",
          " ": "ignored",
        },
        overviewTab: "InvalidTab",
      } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.colorMode).toBe("light");
    expect(merged.watchCodePortalOpen).toBe(false);
    expect(merged.projectChatAuxViewByProjectConfigId).toEqual({});
    expect(merged.customProjectChatSlashCommandsByProjectConfigId).toEqual({
      "project-a": [
        {
          command: "/trim",
          prompt: "Trim this.",
          appGenerationMode: null,
        },
      ],
    });
    expect(merged.projectChatDraftMessageByProjectConfigId).toEqual({
      "project-a": "Unsaved",
    });
    expect(merged.overviewTab).toBe("Overview");
  });

  it("persists only durable preference fields", () => {
    const partialize = useLocalStorage.persist.getOptions().partialize;
    const persisted = partialize({
      ...useLocalStorage.getState(),
      watchCodePortalOpen: true,
      projectChatAuxViewByProjectConfigId: {
        "project-a": "skills",
      },
    });

    expect(persisted).not.toHaveProperty("watchCodePortalOpen");
    expect(persisted).not.toHaveProperty("projectChatAuxViewByProjectConfigId");
    expect(persisted).toHaveProperty("overviewVis");
    expect(persisted).toHaveProperty("uiEditorTab");
  });
});
