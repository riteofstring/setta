import { createAgentRun } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  buildAgentNativeSlashCommandsByEngineId,
  filterAgentNativeSlashCommandsByEngineId,
  resolveExecutableProjectChatCustomSlashCommands,
} from "./projectChatSlashCommandResolver";

describe("project chat slash command resolver", () => {
  it("keeps the newest native slash metadata per engine and normalizes tokens", () => {
    const olderRun = createAgentRun({
      startedAt: "2026-03-01T00:00:00Z",
      finishedAt: "2026-03-01T00:00:01Z",
      outputs: {
        metadata: {
          engineConfigId: "engine-a",
          agentNativeSlashCommands: [" /help "],
          agentNativeSlashCommandsStatus: "available",
        },
      },
    });
    const newerRun = createAgentRun({
      startedAt: "2026-03-02T00:00:00Z",
      finishedAt: "2026-03-02T00:00:01Z",
      outputs: {
        metadata: {
          engineConfigId: "engine-a",
          agentNativeSlashCommands: ["deploy", " /status "],
          agentNativeSlashCommandsStatus: "available",
          agentNativeSlashCommandsStatusDetail: "Latest metadata",
        },
      },
    });

    const byEngineId = buildAgentNativeSlashCommandsByEngineId([
      olderRun,
      newerRun,
    ]);

    expect(byEngineId).toEqual({
      "engine-a": {
        commands: ["/deploy", "/status"],
        status: "available",
        statusDetail: "Latest metadata",
      },
    });
  });

  it("drops native command metadata for removed engines", () => {
    const filtered = filterAgentNativeSlashCommandsByEngineId({
      agentNativeSlashCommandsByEngineId: {
        "active-engine": {
          commands: ["/help"],
          status: "available",
          statusDetail: null,
        },
        "removed-engine": {
          commands: ["/triage"],
          status: "available",
          statusDetail: null,
        },
      },
      allowedEngineIds: ["active-engine"],
    });

    expect(filtered).toEqual({
      "active-engine": {
        commands: ["/help"],
        status: "available",
        statusDetail: null,
      },
    });
  });

  it("removes custom slash commands that collide with reserved commands", () => {
    const resolved = resolveExecutableProjectChatCustomSlashCommands({
      customSlashCommands: [
        {
          command: "/deploy",
          prompt: "should be removed",
        },
        {
          command: "/triage",
          prompt: "Summarize active incidents.",
        },
      ],
      reservedSlashCommandTokens: new Set(["/deploy"]),
    });

    expect(resolved.conflictedCustomSlashCommands).toEqual(["/deploy"]);
    expect(
      resolved.executableCustomSlashCommandDefinitions.map(
        (entry) => entry.command,
      ),
    ).toEqual(["/triage"]);
    expect(resolved.sanitizedCustomSlashCommands).toEqual([
      {
        command: "/triage",
        prompt: "Summarize active incidents.",
      },
    ]);
  });
});
