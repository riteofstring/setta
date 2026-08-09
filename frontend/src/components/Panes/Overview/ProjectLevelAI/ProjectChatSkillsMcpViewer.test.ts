import { createAgentRun } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { resolveAgentNativeSlashCommandsByEngineId } from "./projectChatSkillsMcpViewerUtils";

describe("resolveAgentNativeSlashCommandsByEngineId", () => {
  it("keeps only authoritative entries for the active project and engine set", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-foreign-project",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-foreign",
              agentNativeSlashCommands: ["/ship"],
            },
          },
        }),
        createAgentRun({
          id: "run-active-engine",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/help"],
            },
          },
        }),
        createAgentRun({
          id: "run-deleted-engine",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-deleted",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      projectConfigId: "project-b",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: ["/help"],
        status: "available",
        statusDetail: null,
      },
    });
  });

  it("keeps the newest run per engine when runs arrive in reverse chronological order", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-older",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: "2026-02-01T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/old"],
            },
          },
        }),
        createAgentRun({
          id: "run-newer",
          startedAt: "2026-02-02T00:00:00Z",
          finishedAt: "2026-02-02T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/new"],
            },
          },
        }),
      ],
      projectConfigId: "project-b",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: ["/new"],
        status: "available",
        statusDetail: null,
      },
    });
  });

  it("lets a newer none status clear stale commands from older runs", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-older",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: "2026-02-01T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
        createAgentRun({
          id: "run-newer",
          startedAt: "2026-02-02T00:00:00Z",
          finishedAt: "2026-02-02T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: [],
              agentNativeSlashCommandsStatus: "none",
            },
          },
        }),
      ],
      projectConfigId: "project-b",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: [],
        status: "none",
        statusDetail: null,
      },
    });
  });
});
