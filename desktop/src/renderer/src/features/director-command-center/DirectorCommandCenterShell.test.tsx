import type {
  DirectorSnapshot,
  DirectorWorkstreamEntry,
  SemanticNode,
  SemanticNodeKind,
  SemanticNodeStatus,
  WorkstreamGraph,
  WorkstreamStatus,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { buildApprovalAnswers } from "./DirectorArtifactsRail";
import {
  directorWorkstreamKeyboardDirection,
  directorWorkstreamNavigation,
  effectiveDirectorRailVisibility,
} from "./DirectorCommandCenterShell";
import { currentDirectorActivity } from "./DirectorNowActivityList";
import { directorWorkstreamSwitchTransition } from "./director-workstream-switch-transition";

describe("Director command-center approval answers", () => {
  test("builds structured answers from public question definitions", () => {
    const result = buildApprovalAnswers(
      [
        {
          allowsOther: false,
          header: "Scope",
          id: "scope",
          options: ["staging", "production"],
          question: "Which scope should be used?",
          secret: true,
        },
      ],
      { scope: " production " },
    );

    expect(result).toEqual({
      answers: [{ answers: ["production"], questionId: "scope" }],
      status: "valid",
    });
  });

  test("rejects missing and unauthorized structured answers before dispatch", () => {
    const result = buildApprovalAnswers(
      [
        {
          allowsOther: false,
          header: "Scope",
          id: "scope",
          options: ["staging"],
          question: "Which scope should be used?",
          secret: false,
        },
        {
          allowsOther: true,
          header: "Notes",
          id: "notes",
          options: [],
          question: "What should be sent?",
          secret: false,
        },
      ],
      { notes: "", scope: "production" },
    );

    expect(result).toEqual({
      errors: {
        notes: "Answer this question.",
        scope: "Choose one of the listed answers.",
      },
      firstInvalidQuestionId: "scope",
      status: "invalid",
    });
  });
});

describe("Director command-center shell view state", () => {
  test("builds bounded current activity from typed semantic nodes", () => {
    const activity = currentDirectorActivity(
      graphWithNodes([
        semanticNode(1, "user_goal", "succeeded"),
        semanticNode(2, "director_decision", "succeeded"),
        semanticNode(3, "plan", "active"),
        semanticNode(4, "action", "active"),
        semanticNode(5, "artifact", "succeeded"),
        semanticNode(6, "validation", "succeeded"),
        semanticNode(7, "completed", "succeeded"),
      ]),
    );

    expect(activity.map((node) => node.id)).toEqual([
      "node:7",
      "node:6",
      "node:5",
      "node:4",
      "node:3",
    ]);
  });

  test("windows large workstream sets around the selected entry", () => {
    const navigation = directorWorkstreamNavigation(snapshotWithWorkstreams(30, 22));

    expect(navigation.visibleEntries).toHaveLength(19);
    expect(navigation.visibleEntries[0]?.entry.workstream.id).toBe("workstream:12");
    expect(navigation.visibleEntries.at(-1)?.entry.workstream.id).toBe("workstream:30");
    expect(navigation.selected?.workstream.id).toBe("workstream:22");
    expect(navigation.counter).toBe("22/30");
  });

  test("keeps compact rail disclosure as view state", () => {
    expect(
      effectiveDirectorRailVisibility({
        compact: false,
        compactRail: null,
        railVisibility: { artifacts: false, now: true },
      }),
    ).toEqual({ artifacts: false, now: true });

    expect(
      effectiveDirectorRailVisibility({
        compact: true,
        compactRail: "artifacts",
        railVisibility: { artifacts: true, now: true },
      }),
    ).toEqual({ artifacts: true, now: false });
  });

  test("routes arrow-key workstream navigation without fighting text editing", () => {
    expect(
      directorWorkstreamKeyboardDirection({
        altKey: false,
        ctrlKey: false,
        key: "ArrowLeft",
        metaKey: false,
        targetIsEditable: false,
      }),
    ).toBe("previous");

    expect(
      directorWorkstreamKeyboardDirection({
        altKey: false,
        ctrlKey: false,
        key: "ArrowRight",
        metaKey: false,
        targetIsEditable: true,
      }),
    ).toBeNull();

    expect(
      directorWorkstreamKeyboardDirection({
        altKey: false,
        ctrlKey: false,
        key: "ArrowRight",
        metaKey: true,
        targetIsEditable: true,
      }),
    ).toBe("next");
  });

  test("classifies workstream switch transitions as view state", () => {
    const entries = snapshotWithWorkstreams(3, 2).workstreams;

    expect(directorWorkstreamSwitchTransition(null, "workstream:1", entries)).toBeNull();
    expect(directorWorkstreamSwitchTransition("workstream:1", "workstream:1", entries)).toBeNull();
    expect(directorWorkstreamSwitchTransition("workstream:1", "workstream:3", entries)).toBe(
      "next",
    );
    expect(directorWorkstreamSwitchTransition("workstream:3", "workstream:1", entries)).toBe(
      "previous",
    );
    expect(directorWorkstreamSwitchTransition("workstream:missing", "workstream:2", entries)).toBe(
      "jump",
    );
  });
});

function snapshotWithWorkstreams(count: number, selectedPosition: number): DirectorSnapshot {
  const workstreams = Array.from({ length: count }, (_, index) =>
    workstreamEntry(index + 1, index + 1 === selectedPosition ? "running" : "idle"),
  );
  return {
    aggregates: {
      artifactCount: 0,
      awaitingApprovalCount: 0,
      awaitingResourceCount: 0,
      blockedCount: 0,
      failedCount: 0,
      queuedCount: 0,
      runningCount: 1,
      unresolvedApprovalCount: 0,
      unresolvedResourceRequestCount: 0,
      workstreamCount: count,
    },
    artifacts: [],
    connection: { lastEventAt: null, status: "connected" },
    eventCursor: { sequence: 0, streamId: "director:test" },
    graphs: [],
    hasMoreWorkstreams: false,
    schemaVersion: 1,
    selectedWorkstreamId: `workstream:${selectedPosition}`,
    unresolvedApprovals: [],
    unresolvedResourceRequests: [],
    workstreams,
  };
}

function workstreamEntry(position: number, status: WorkstreamStatus): DirectorWorkstreamEntry {
  return {
    detailLevel: "background",
    workstream: {
      activeRunId: status === "running" ? `run:${position}` : null,
      artifactCount: 0,
      createdAt: "2026-07-25T17:00:00Z",
      id: `workstream:${position}`,
      lastMilestone: null,
      parentId: null,
      queuedRunCount: 0,
      resourceBindings: [],
      resourceScope: { folder: null, kind: "folderless" },
      status,
      title: `Workstream ${position}`,
      unresolvedApprovalCount: 0,
      unresolvedResourceRequestCount: 0,
      updatedAt: `2026-07-25T17:${String(position).padStart(2, "0")}:00Z`,
    },
  };
}

function graphWithNodes(nodes: SemanticNode[]): WorkstreamGraph {
  return {
    detailLevel: "selected",
    edges: [],
    hasEarlier: false,
    nodes,
    workstreamId: "workstream:activity",
  };
}

function semanticNode(
  position: number,
  kind: SemanticNodeKind,
  status: SemanticNodeStatus,
): SemanticNode {
  return {
    actor: kind === "director_decision" ? "director" : "worker",
    artifactIds: kind === "artifact" ? [`artifact:${position}`] : [],
    completedAt:
      status === "active" || status === "pending" || status === "waiting"
        ? null
        : timestamp(position, 1),
    createdAt: timestamp(position, 0),
    evidenceClass: kind === "director_decision" ? "director_interpretation" : "runtime_fact",
    id: `node:${position}`,
    interpretation: null,
    kind,
    publicSummary: `Activity ${position}`,
    runId: "run:activity",
    sourceEventIds: [`event:${position}`],
    status,
    updatedAt: timestamp(position, 1),
    workstreamId: "workstream:activity",
  };
}

function timestamp(position: number, offset: number): string {
  return `2026-07-25T17:${String(position).padStart(2, "0")}:${String(offset).padStart(2, "0")}Z`;
}
