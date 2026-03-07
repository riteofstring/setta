import { describe, expect, it } from "vitest";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";

describe("selectCustomProjectChatSlashCommands", () => {
  it("returns a stable empty fallback for projects without custom commands", () => {
    const commandsByProject = {
      "project-a": [{ command: "/ship", prompt: "Ship the release." }],
    };

    const first = selectCustomProjectChatSlashCommands(
      commandsByProject,
      "project-missing",
    );
    const second = selectCustomProjectChatSlashCommands(
      commandsByProject,
      "project-missing",
    );

    expect(first).toEqual([]);
    expect(second).toBe(first);
  });

  it("returns the exact project command list when custom commands exist", () => {
    const projectCommands = [{ command: "/triage", prompt: "Triage bugs." }];
    const commandsByProject = {
      "project-a": projectCommands,
    };

    const selected = selectCustomProjectChatSlashCommands(
      commandsByProject,
      "project-a",
    );

    expect(selected).toBe(projectCommands);
  });
});
