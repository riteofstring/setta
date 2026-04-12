import {
  RunStatusEnum,
  SectionTypeEnum,
  createAgentRun,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getStateMachineNodePresentation } from "./stateMachineNodePresentation";

function createStateMachineRun(args: {
  id: string;
  status: RunStatusEnum;
  events: Array<Record<string, unknown>>;
  outputs?: Record<string, unknown> | null;
}) {
  return createAgentRun({
    id: args.id,
    status: args.status,
    startedAt: "2024-01-01T00:00:00Z",
    finishedAt: "2024-01-01T00:05:00Z",
    inputs: {
      runType: "state_machine",
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
    },
    outputs: args.outputs ?? null,
    events: args.events,
  });
}

describe("getStateMachineNodePresentation", () => {
  it("renders payload-count activity labels for machine events", () => {
    const presentation = getStateMachineNodePresentation({
      runs: [
        createStateMachineRun({
          id: "run-activity-counts",
          status: RunStatusEnum.completed,
          events: [
            {
              id: "event-run-completed",
              timestamp: "2024-01-01T00:00:01Z",
              type: "run_completed",
            },
            {
              id: "event-child-runs-cancelled",
              timestamp: "2024-01-01T00:00:02Z",
              type: "child_runs_cancelled",
              payload: {
                childRunIds: ["child-1", "child-2"],
              },
            },
            {
              id: "event-start-actions",
              timestamp: "2024-01-01T00:00:03Z",
              type: "start_edge_actions_dispatched",
              payload: {
                actions: ["action-1", "action-2", "action-3"],
              },
            },
          ],
        }),
      ],
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
      sectionId: "section-start",
      sectionType: SectionTypeEnum.StateMachineStart,
    });

    expect(presentation.activityItems).toEqual([
      {
        id: "event-start-actions",
        label: "Dispatched 3 start actions",
        tone: "default",
      },
      {
        id: "event-child-runs-cancelled",
        label: "Cancelled 2 child runs",
        tone: "warning",
      },
      {
        id: "event-run-completed",
        label: "Workflow completed",
        tone: "success",
      },
    ]);
  });

  it("falls back to the generic signal label when the payload omits the signal name", () => {
    const presentation = getStateMachineNodePresentation({
      runs: [
        createStateMachineRun({
          id: "run-signal-fallback",
          status: RunStatusEnum.completed,
          events: [
            {
              id: "event-signal",
              timestamp: "2024-01-01T00:00:01Z",
              type: "signal_reported",
            },
          ],
        }),
      ],
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
      sectionId: "section-start",
      sectionType: SectionTypeEnum.StateMachineStart,
    });

    expect(presentation.activityItems).toEqual([
      {
        id: "event-signal",
        label: "Signal reported",
        tone: "success",
      },
    ]);
  });

  it("uses blocked gate styling when a gate run is blocked before all inputs arrive", () => {
    const presentation = getStateMachineNodePresentation({
      runs: [
        createStateMachineRun({
          id: "run-gate-progress",
          status: RunStatusEnum.running,
          outputs: {
            gateIncomingEdgeIdsBySectionId: {
              "section-gate": ["edge-a", "edge-b"],
            },
            gateInputEdgeIdsBySectionId: {
              "section-gate": ["edge-a"],
            },
            gateStatusBySectionId: {
              "section-gate": "blocked",
            },
          },
          events: [
            {
              id: "event-gate-blocked",
              timestamp: "2024-01-01T00:00:01Z",
              type: "gate_blocked",
              payload: {
                gateSectionId: "section-gate",
              },
            },
          ],
        }),
      ],
      projectConfigId: "project-1",
      machineGroupId: "workflow-main",
      sectionId: "section-gate",
      sectionType: SectionTypeEnum.StateMachineGate,
    });

    expect(presentation.gateStatus?.label).toBe("Blocked");
    expect(presentation.gateStatus?.classes).toContain("text-rose-800");
    expect(presentation.gateInputProgress?.label).toBe("1 / 2");
    expect(presentation.gateInputProgress?.classes).toContain("text-rose-800");
  });
});
