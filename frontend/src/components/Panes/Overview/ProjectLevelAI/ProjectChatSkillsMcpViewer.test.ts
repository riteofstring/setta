import { describe, expect, it } from "vitest";

import { parseAgentNativeSlashCommandsStorage } from "./ProjectChatSkillsMcpViewer";

describe("parseAgentNativeSlashCommandsStorage", () => {
  it("ignores legacy array-shaped storage entries", () => {
    const parsed = parseAgentNativeSlashCommandsStorage(
      JSON.stringify({
        "engine-1": ["/legacy"],
      }),
    );

    expect(parsed).toEqual({});
  });

  it("hydrates canonical object-shaped entries", () => {
    const parsed = parseAgentNativeSlashCommandsStorage(
      JSON.stringify({
        "engine-1": {
          commands: [" /help ", "/status"],
          status: "available",
          statusDetail: "Loaded from run metadata",
        },
      }),
    );

    expect(parsed).toEqual({
      "engine-1": {
        commands: ["/help", "/status"],
        status: "available",
        statusDetail: "Loaded from run metadata",
      },
    });
  });
});
