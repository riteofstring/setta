import { AGENTIC_EDGE_HANDLE_IDS } from "state/actions/agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdges";
import { describe, expect, it } from "vitest";
import {
  getProjectGpuHandleConnectionProps,
  getProjectGpuReverseStartHandleConnectionProps,
} from "./projectGpuHandleAdapter";

describe("project GPU handle adapter", () => {
  it("keeps Setta handle-family filtering in project-owned handle props", () => {
    const props = getProjectGpuHandleConnectionProps(
      AGENTIC_EDGE_HANDLE_IDS.source,
    );

    expect(
      props.isConnectionCandidateAllowed?.({
        handleId: SHARED_CHAT_EDGE_HANDLE_IDS.target,
        sectionId: "chat",
        type: "target",
      }),
    ).toBe(true);
    expect(
      props.isConnectionCandidateAllowed?.({
        handleId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
        sectionId: "workflow",
        type: "target",
      }),
    ).toBe(false);
  });

  it("makes reverse-start pointer-up snapping explicit project metadata", () => {
    const props = getProjectGpuReverseStartHandleConnectionProps(
      STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
    );

    expect(props.pointerUpSnapRadius).toBe(80);
    expect(
      props.isConnectionCandidateAllowed?.({
        handleId: SHARED_CHAT_EDGE_HANDLE_IDS.source,
        sectionId: "chat",
        type: "source",
      }),
    ).toBe(true);
  });
});
