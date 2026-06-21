import type { WorkspaceTrajectorySprite } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  normalizeTrajectoryDisplayText,
  trajectorySpriteCanvasLabel,
  trajectorySpriteFullDetailLabel,
  trajectorySpritePrimaryLabel,
  trajectorySpriteSecondaryLabel,
} from "./workspace-trajectory-display-labels";

describe("workspace trajectory display labels", () => {
  test("uses raw command text as the primary command label", () => {
    const sprite = trajectorySprite({
      command: { command: 'rg "foo" src/', cwd: "", durationMs: 0, exitCode: 0 },
      kind: "command",
      subtitle: "command_execution",
      title: "Command",
    });

    expect(trajectorySpritePrimaryLabel(sprite)).toBe('rg "foo" src/');
    expect(trajectorySpriteCanvasLabel(sprite)).toBe('rg "foo" src/');
    expect(trajectorySpriteSecondaryLabel(sprite)).toBe("running command");
  });

  test("normalizes command previews without parsing shell intent", () => {
    const sprite = trajectorySprite({
      command: {
        command: "sed\t-n '1,120p'\nfile.ts\x07",
        cwd: "",
        durationMs: 0,
        exitCode: 0,
      },
      kind: "command",
      title: "Command",
    });

    expect(trajectorySpritePrimaryLabel(sprite)).toBe("sed -n '1,120p' file.ts");
    expect(trajectorySpriteSecondaryLabel(sprite)).toBe("running command");
  });

  test("falls back for command sprites when raw command text is empty", () => {
    expect(
      trajectorySpritePrimaryLabel(
        trajectorySprite({ kind: "command", subtitle: "Shell command", title: "Command" }),
      ),
    ).toBe("Shell command");
    expect(
      trajectorySpritePrimaryLabel(
        trajectorySprite({ kind: "command", subtitle: "", title: "Command" }),
      ),
    ).toBe("Command");
  });

  test("keeps failure status separate from the command preview", () => {
    const shortFailedCommand = trajectorySprite({
      command: {
        command: 'rg "foo" src/',
        cwd: "",
        durationMs: 0,
        exitCode: 1,
      },
      kind: "command",
      status: "failed",
      title: "Command",
    });
    const sprite = trajectorySprite({
      command: {
        command: "./scripts/go.sh test -count=1 ./internal/workspacetrajectory",
        cwd: "",
        durationMs: 0,
        exitCode: 1,
      },
      kind: "command",
      status: "failed",
      title: "Command",
    });

    expect(trajectorySpritePrimaryLabel(shortFailedCommand)).toBe('rg "foo" src/');
    expect(trajectorySpriteCanvasLabel(shortFailedCommand)).toBe('rg "foo" src/ failed');
    expect(trajectorySpritePrimaryLabel(sprite)).toBe(
      "./scripts/go.sh test -count=1 ./internal/workspacetrajectory",
    );
    expect(trajectorySpriteCanvasLabel(sprite)).toHaveLength(22);
    expect(trajectorySpriteCanvasLabel(sprite)).toMatch(/^\.\/scripts\/go\.sh/);
    expect(trajectorySpriteSecondaryLabel(sprite)).toBe("failed command");
  });

  test("exposes full command detail without canvas truncation", () => {
    const sprite = trajectorySprite({
      command: {
        command:
          "pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workspace-trajectory-display-labels.test.ts",
        cwd: "",
        durationMs: 0,
        exitCode: 0,
      },
      kind: "command",
      title: "Command",
    });

    expect(trajectorySpriteCanvasLabel(sprite)).toHaveLength(22);
    expect(trajectorySpriteCanvasLabel(sprite)).toMatch(/^pnpm -C desktop/);
    expect(trajectorySpriteFullDetailLabel(sprite)).toBe(
      "pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workspace-trajectory-display-labels.test.ts",
    );
  });

  test("collapses whitespace and strips control characters", () => {
    expect(normalizeTrajectoryDisplayText("  rg\t\x01foo\nsrc/  ")).toBe("rg foo src/");
  });
});

function trajectorySprite(
  overrides: Partial<WorkspaceTrajectorySprite> = {},
): WorkspaceTrajectorySprite {
  return {
    cartographerPatchId: "",
    cartographerRunId: "",
    cartographerWindowId: "",
    chatConversationId: "conversation_review",
    chatMessageId: "message_review",
    chatRunId: "chat_run_review",
    command: {
      command: "",
      cwd: "",
      durationMs: 0,
      exitCode: 0,
    },
    createdAt: "2026-06-17T12:00:01Z",
    diffStats: {
      additions: 0,
      changedFiles: 0,
      deletions: 0,
      structured: false,
      summary: "",
    },
    errorSummary: "",
    expiresAt: "",
    fileRefs: [],
    id: "sprite_review",
    kind: "assistant_message",
    providerItemId: "provider_item_review",
    resultSummary: "",
    runItemId: "run_item_review",
    schemaVersion: 1,
    severity: "info",
    sourceRefs: [],
    status: "running",
    subtitle: "Assistant output",
    title: "Review",
    tool: {
      namespace: "",
      requestId: "",
      serverName: "",
      toolName: "",
    },
    ttlMs: 0,
    updatedAt: "2026-06-17T12:00:01Z",
    workflowExecutionId: "workflow_execution_review",
    workflowNodeExecutionId: "workflow_node_execution_review",
    workflowNodeId: "reviewer",
    workspaceId: "workspace_graph",
    ...overrides,
  };
}
