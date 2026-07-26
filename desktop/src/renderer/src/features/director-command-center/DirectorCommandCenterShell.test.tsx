import type {
  ApprovalRequest,
  DirectorSnapshot,
  DirectorWorkstreamEntry,
  SemanticNode,
  SemanticNodeKind,
  SemanticNodeStatus,
  WorkstreamArtifact,
  WorkstreamGraph,
  WorkstreamStatus,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { directorRailArrivalAnnouncement } from "./DirectorArtifactsRail";
import { buildApprovalAnswers } from "./DirectorPendingActions";
import { directorArtifactCardMetadata } from "./DirectorArtifactPreviewCard";
import {
  DirectorRefreshCoordinator,
  directorEventChangesVisibleState,
  directorPendingWork,
  effectiveDirectorRailVisibility,
} from "./DirectorCommandCenterShell";
import { directorGraphTimeSecondsAt, packDirectorGraphs } from "./director-graph-presentation";
import {
  directorComposerHint,
  directorComposerTakesKeystroke,
  restoreFailedDirectorDraft,
} from "./DirectorComposer";
import {
  directorWorkstreamKeyboardDirection,
  directorWorkstreamNavigation,
  workstreamSelectionCanMove,
} from "./DirectorWorkstreamNavigation";
import { directorWorkstreamSwitchTransition } from "./director-workstream-switch-transition";
import { directorFocus, directorFocusFolder, directorWorkstreamSummary } from "./director-focus";

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
  // A card says whether its artifact is readable. How many events produced it
  // is provenance, which belongs to the artifact surface rather than to a
  // one-line card caption that a reader cannot act on.
  test("labels artifact cards with the reader-facing status alone", () => {
    expect(
      directorArtifactCardMetadata({
        ...workstreamArtifact(),
        sourceEventIds: ["event:1"],
        status: "available",
      }),
    ).toBe("Ready");

    expect(
      directorArtifactCardMetadata({
        ...workstreamArtifact(),
        sourceEventIds: ["event:1", "event:2"],
        status: "unresolved",
      }),
    ).toBe("This artifact has not arrived yet.");
  });

  test("announces typed artifact lifecycle changes at their update time", () => {
    const artifact = workstreamArtifact();
    const approval = {
      id: "approval:1",
      kind: "command",
      publicSummary: "Approve the build.",
      questions: [],
      requestedAt: "2026-07-25T17:00:00.500Z",
      resolvedAt: null,
      runId: "run:1",
      secret: false,
      sourceEventIds: ["event:approval"],
      status: "pending",
      workstreamId: "workstream:1",
    } satisfies ApprovalRequest;

    expect(directorRailArrivalAnnouncement([approval], [], [artifact])).toBe(
      "Artifact declared: Generated artifact",
    );
    expect(
      directorRailArrivalAnnouncement(
        [],
        [],
        [{ ...artifact, status: "unresolved", updatedAt: "2026-07-25T17:00:02Z" }],
      ),
    ).toBe("Artifact pending: Generated artifact");
    expect(
      directorRailArrivalAnnouncement(
        [],
        [],
        [{ ...artifact, status: "available", updatedAt: "2026-07-25T17:00:03Z" }],
      ),
    ).toBe("Artifact ready: Generated artifact");
  });

  /*
   * The canvas draws the view, which is the whole reason selection means
   * something now. The Director's view is every workstream at once; a
   * workstream's view is that workstream alone.
   */
  test("packs the whole constellation for the Director and one workstream otherwise", () => {
    const graphs = [
      graphWithNodes([semanticNode(1, "action", "active")], "workstream:1"),
      graphWithNodes(
        [semanticNode(2, "action", "active"), semanticNode(3, "artifact", "succeeded")],
        "workstream:2",
      ),
    ];

    expect(packDirectorGraphs(graphs, null).nodeCount).toBe(3);
    expect(packDirectorGraphs(graphs, "workstream:2").nodeCount).toBe(2);
    expect(packDirectorGraphs(graphs, "workstream:1").nodeCount).toBe(1);
    // A workstream with no graph yet draws nothing rather than the composition.
    expect(packDirectorGraphs(graphs, "workstream:absent").nodeCount).toBe(0);
    expect(packDirectorGraphs(undefined, null).nodeCount).toBe(0);
  });

  test("does not present a resolved blocker as current running work", () => {
    const running = workstreamEntry(1, "running").workstream;
    running.lastMilestone = {
      kind: "resource_required",
      nodeId: "resource:1",
      occurredAt: "2026-07-25T17:00:00Z",
      publicSummary: "Waiting for a project folder before this work can start.",
    };

    expect(directorWorkstreamSummary(running)).toBeNull();
    expect(
      directorWorkstreamSummary({
        ...running,
        activeRunId: null,
        status: "awaiting_resource",
        unresolvedResourceRequestCount: 1,
      }),
    ).toBe("Waiting for a project folder before this work can start.");
  });

  test("anchors graph animation time to durable graph timestamps", () => {
    const snapshot = snapshotWithWorkstreams(1, 1);
    snapshot.connection.lastEventAt = "2026-07-25T12:00:06Z";
    snapshot.graphs = [
      {
        ...graphWithNodes([semanticNode(1, "action", "active")]),
        nodes: [
          {
            ...semanticNode(1, "action", "active"),
            createdAt: "2026-07-25T12:00:02Z",
            updatedAt: "2026-07-25T12:00:04Z",
          },
        ],
      },
    ];

    const secondsAt = directorGraphTimeSecondsAt(snapshot, 1_000);

    expect(secondsAt(1_000)).toBe(4);
    expect(secondsAt(1_500)).toBe(4.5);
  });

  test("does not rebuild visible state for best-effort text deltas", () => {
    const snapshot = snapshotWithWorkstreams(1, 1);
    expect(
      directorEventChangesVisibleState({
        aggregatesUpdated: null,
        approvalUpdated: null,
        artifactUpdated: null,
        emittedAt: "2026-07-25T12:00:00Z",
        eventId: "event:1",
        graphUpdated: null,
        kind: "director.text.delta",
        resourceRequestUpdated: null,
        resyncRequired: null,
        schemaVersion: 1,
        selectionChanged: null,
        sequence: 1,
        streamId: snapshot.eventCursor.streamId,
        textDelta: {
          runId: null,
          surface: "assistant_message",
          text: "delta",
          workstreamId: "workstream:1",
        },
        workstreamRemoved: null,
        workstreamUpdated: null,
      }),
    ).toBe(false);
  });

  test("moves between the Director and a lone workstream in either direction", () => {
    // One workstream is two destinations, because the Director's own view is
    // one of them. The arrows went dead here while the strip was still showing
    // both dots.
    expect(
      workstreamSelectionCanMove(directorWorkstreamNavigation(snapshotWithWorkstreams(1, 1))),
    ).toBe(true);
    expect(
      workstreamSelectionCanMove(directorWorkstreamNavigation(snapshotWithWorkstreams(1, 0))),
    ).toBe(true);
  });

  test("cannot move with no workstream to move to", () => {
    expect(
      workstreamSelectionCanMove(directorWorkstreamNavigation(snapshotWithWorkstreams(0, 0))),
    ).toBe(false);
  });

  test("windows large workstream sets around the selected entry", () => {
    const navigation = directorWorkstreamNavigation(snapshotWithWorkstreams(30, 22));

    expect(navigation.visibleEntries).toHaveLength(19);
    expect(navigation.visibleEntries[0]?.entry.workstream.id).toBe("workstream:12");
    expect(navigation.visibleEntries.at(-1)?.entry.workstream.id).toBe("workstream:30");
    expect(navigation.selected?.workstream.id).toBe("workstream:22");
    expect(navigation.counter).toBe("22/30");
  });

  test("does not invent a selected ordinal for a truncated registry window", () => {
    const snapshot = snapshotWithWorkstreams(30, 22);
    snapshot.aggregates.workstreamCount = 201;
    snapshot.hasMoreWorkstreams = true;

    expect(directorWorkstreamNavigation(snapshot).counter).toBe("201 total");
  });

  test("does not invent a focused workstream when durable selection is empty", () => {
    const snapshot = snapshotWithWorkstreams(2, 1);
    snapshot.selectedWorkstreamId = null;

    expect(directorWorkstreamNavigation(snapshot)).toMatchObject({
      counter: null,
      selected: null,
      selectedIndex: -1,
    });
  });

  test("replays a resync requested while a Director snapshot refresh is in flight", async () => {
    const coordinator = new DirectorRefreshCoordinator();
    const states: string[] = [];
    let releaseInitial!: () => void;
    const initialBlocked = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    const operation = async (state: string): Promise<void> => {
      states.push(state);
      if (state === "loading") {
        await initialBlocked;
      }
    };

    const initial = coordinator.request("loading", operation);
    await coordinator.request("resyncing", operation);
    await coordinator.request("resyncing", operation);
    releaseInitial();
    await initial;

    expect(states).toEqual(["loading", "resyncing"]);
  });

  test("keeps compact rail disclosure as view state", () => {
    expect(
      effectiveDirectorRailVisibility({
        compact: false,
        compactRail: null,
        onDirectorView: false,
        railVisibility: { artifacts: false, now: true },
      }),
    ).toEqual({ artifacts: false, now: true });

    expect(
      effectiveDirectorRailVisibility({
        compact: true,
        compactRail: "artifacts",
        onDirectorView: false,
        railVisibility: { artifacts: true, now: true },
      }),
    ).toEqual({ artifacts: true, now: false });
  });

  // The Director's view is the constellation. A rail over it names the first
  // column rather than sitting beside it, and what it would say belongs to the
  // thread one arrow away.
  test("gives the Director's view no rails, whatever the toggles say", () => {
    expect(
      effectiveDirectorRailVisibility({
        compact: false,
        compactRail: null,
        onDirectorView: true,
        railVisibility: { artifacts: true, now: true },
      }),
    ).toEqual({ artifacts: false, now: false });

    expect(
      effectiveDirectorRailVisibility({
        compact: true,
        compactRail: "now",
        onDirectorView: true,
        railVisibility: { artifacts: true, now: true },
      }),
    ).toEqual({ artifacts: false, now: false });
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
    ).toBeNull();
  });

  test("names the Director when no workstream is in focus", () => {
    expect(directorFocus(null)).toEqual({
      kind: "director",
      roleLabel: "No workstream in focus",
      title: "Director",
    });
  });

  // The top bar no longer carries a folder chip: it never changed while a
  // workstream was selected, so it spent bar width on a constant. The fact is
  // still reachable — every workstream dot names its folder — and that is what
  // this guards, because losing it entirely is the real risk.
  test("names the folder a workstream runs in, without the bar carrying it", () => {
    const bound = directorFocus({
      ...workstreamEntry(7, "running").workstream,
      resourceScope: {
        folder: { rootPath: "/Users/dev/code/setta", workspaceId: "workspace:1" },
        kind: "folder",
      },
    });
    expect(bound).toEqual({
      kind: "workstream",
      status: "running",
      statusLabel: "Running",
      summary: null,
      title: "Workstream 7",
    });

    expect(
      directorFocusFolder({
        folder: { rootPath: "/Users/dev/code/setta", workspaceId: "workspace:1" },
        kind: "folder",
      }),
    ).toEqual({ label: "setta", path: "/Users/dev/code/setta" });

    expect(directorFocus(workstreamEntry(8, "awaiting_resource").workstream)).toEqual({
      kind: "workstream",
      status: "awaiting_resource",
      statusLabel: "Needs folder",
      summary: null,
      title: "Workstream 8",
    });
    expect(
      directorFocusFolder(workstreamEntry(8, "awaiting_resource").workstream.resourceScope),
    ).toEqual({ label: "No folder", path: null });
  });

  test("keeps a Director turn from reading as a busy direct command", () => {
    expect(directorPendingWork([])).toEqual({ answering: false, dispatching: false });
    expect(directorPendingWork(["answering"])).toEqual({ answering: true, dispatching: false });
    expect(directorPendingWork(["command", "command"])).toEqual({
      answering: false,
      dispatching: true,
    });
    expect(directorPendingWork(["answering", "command"])).toEqual({
      answering: true,
      dispatching: true,
    });
  });

  test("reports the Director's own turn in the composer hint", () => {
    const workstream = directorFocus(workstreamEntry(4, "running").workstream);

    expect(directorComposerHint(directorFocus(null), false)).toEqual({
      answering: false,
      focusText: "No workstream in focus",
      role: "Director",
      statusText: null,
    });
    expect(directorComposerHint(directorFocus(null), true)).toMatchObject({
      answering: true,
      statusText: "Answering",
    });
    expect(directorComposerHint(workstream, false)).toEqual({
      answering: false,
      focusText: "on Workstream 4",
      role: "Director",
      statusText: "Running",
    });
    expect(directorComposerHint(workstream, true)).toMatchObject({ statusText: "Answering" });
  });

  test("routes stray typing into the composer without eating app keystrokes", () => {
    expect(directorComposerTakesKeystroke(keystroke({ key: "c" }))).toBe(true);
    expect(directorComposerTakesKeystroke(keystroke({ key: "C" }))).toBe(true);
    expect(directorComposerTakesKeystroke(keystroke({ key: "c", targetIsEditable: true }))).toBe(
      false,
    );
    expect(directorComposerTakesKeystroke(keystroke({ key: " " }))).toBe(false);
    expect(directorComposerTakesKeystroke(keystroke({ key: "Enter" }))).toBe(false);
    expect(directorComposerTakesKeystroke(keystroke({ key: "ArrowRight" }))).toBe(false);
    expect(directorComposerTakesKeystroke(keystroke({ ctrlKey: true, key: "c" }))).toBe(false);
    expect(directorComposerTakesKeystroke(keystroke({ key: "c", metaKey: true }))).toBe(false);
  });

  test("restores a failed request without replacing a newer draft", () => {
    expect(restoreFailedDirectorDraft("", "First request")).toBe("First request");
    expect(restoreFailedDirectorDraft("Second draft", "First request")).toBe(
      "First request\n\nSecond draft",
    );
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

function keystroke(
  overrides: Partial<Parameters<typeof directorComposerTakesKeystroke>[0]>,
): Parameters<typeof directorComposerTakesKeystroke>[0] {
  return {
    altKey: false,
    ctrlKey: false,
    key: "a",
    metaKey: false,
    targetIsEditable: false,
    ...overrides,
  };
}

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
      conversationId: "conversation:1",
      lastMilestone: null,
      narration: [],
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

function workstreamArtifact(): WorkstreamArtifact {
  return {
    conversationId: "conversation:1",
    createdAt: "2026-07-25T17:00:00Z",
    id: "artifact:1",
    kind: "Report",
    runId: "run:1",
    sourceEventIds: [],
    summary: "What the report found, in one line.",
    status: "declared",
    title: "Generated artifact",
    updatedAt: "2026-07-25T17:00:01Z",
    workspaceId: "workspace:1",
    workstreamId: "workstream:1",
  };
}

function graphWithNodes(
  nodes: SemanticNode[],
  workstreamId = "workstream:activity",
): WorkstreamGraph {
  return {
    detailLevel: "selected",
    edges: [],
    hasEarlier: false,
    nodes,
    workstreamId,
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
