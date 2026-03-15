import type { Connection } from "forks/xyflow/core/types";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "./chatSharedHandleIds";
import {
  isWorkflowHandleId,
  normalizeWorkflowConnectionHandles,
  STATE_MACHINE_EDGE_HANDLE_IDS,
} from "./stateMachineEdgeCanonicalization";

import { describe, expect, it } from "vitest";

describe("stateMachineEdgeCanonicalization", () => {
  it("normalizes shared chat workflow handles to canonical workflow ports", () => {
    const connection: Connection = {
      source: "section-a",
      target: "section-b",
      sourceHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
    };

    expect(normalizeWorkflowConnectionHandles(connection)).toEqual({
      source: "section-a",
      target: "section-b",
      sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
      targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
    });
  });

  it("normalizes reverse-start drags back to source-to-target workflow edges", () => {
    const connection: Connection = {
      source: "section-target",
      target: "section-source",
      sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
      targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    };

    expect(normalizeWorkflowConnectionHandles(connection)).toEqual({
      source: "section-source",
      target: "section-target",
      sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
      targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
    });
  });

  it("recognizes workflow-only handles", () => {
    expect(isWorkflowHandleId(STATE_MACHINE_EDGE_HANDLE_IDS.source)).toBe(true);
    expect(isWorkflowHandleId(STATE_MACHINE_EDGE_HANDLE_IDS.target)).toBe(true);
    expect(isWorkflowHandleId(STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart)).toBe(
      true,
    );
    expect(isWorkflowHandleId("agentic-edge-source")).toBe(false);
  });
});
