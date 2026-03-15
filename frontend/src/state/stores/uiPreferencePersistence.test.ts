import { describe, expect, it } from "vitest";
import {
  partializeUIPreferenceState,
  sanitizePersistedUIPreferenceState,
} from "./uiPreferencePersistence";
import { createDefaultUIPreferenceState } from "./uiPreferenceState";

describe("uiPreferencePersistence", () => {
  it("sanitizes transient and malformed persisted preference state", () => {
    const current = createDefaultUIPreferenceState();

    const merged = sanitizePersistedUIPreferenceState(
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
      },
      current,
    );

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
    const persisted = partializeUIPreferenceState({
      ...createDefaultUIPreferenceState(),
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
