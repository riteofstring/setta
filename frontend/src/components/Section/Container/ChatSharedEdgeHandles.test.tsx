import { NodeIdContext } from "forks/xyflow/core/contexts/NodeIdContext";
import { useReactFlow } from "forks/xyflow/core/store";
import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createAgenticEdge,
  createProjectConfig,
  type AgenticEdgeKind,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  const initialState = store.getInitialState();
  Object.assign(initialState, store.getState());
}

function createWorkflowEdge(options: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return {
    id: "",
    machineGroupId: "workflow-main",
    sourceSectionId: "",
    sourcePortId: "workflow-source",
    targetSectionId: "",
    targetPortId: "workflow-target",
    sourceFilter: null,
    targetAction: null,
    style: null,
    hidden: false,
    zIndex: 0,
    selected: false,
    ...options,
  };
}

function seedSharedChatEdges({
  agenticEdges = [],
  stateMachineEdges = [],
}: {
  agenticEdges?: ReturnType<typeof createAgenticEdge>[];
  stateMachineEdges?: WorkflowEdge[];
} = {}): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      agenticEdges,
      stateMachineEdges,
    });
  });
  syncStoreInitialState(useProjectState);
}

function renderHandles(sectionId: string, isUserView: boolean = false): string {
  return renderToStaticMarkup(
    <NodeIdContext.Provider value={sectionId}>
      <ChatSharedEdgeHandles isUserView={isUserView} />
    </NodeIdContext.Provider>,
  );
}

function expectConnectedHandle(markup: string, testId: string): void {
  expect(markup).toMatch(
    new RegExp(
      `class="[^"]*agentic-handle--connected[^"]*"[^>]*data-testid="${testId}"`,
    ),
  );
}

function expectUnconnectedHandle(markup: string, testId: string): void {
  expect(markup).not.toMatch(
    new RegExp(
      `class="[^"]*agentic-handle--connected[^"]*"[^>]*data-testid="${testId}"`,
    ),
  );
}

function createSharedChatEdge(options: {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKind;
}) {
  return createAgenticEdge(options);
}

describe("ChatSharedEdgeHandles", () => {
  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      connectionStartHandle: null,
      connectionEndHandle: null,
      connectionStatus: null,
    });
  });

  afterEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      connectionStartHandle: null,
      connectionEndHandle: null,
      connectionStatus: null,
    });
  });

  it("marks shared chat handles connected across agentic and workflow edges", () => {
    seedSharedChatEdges({
      agenticEdges: [
        createSharedChatEdge({
          id: "edge-incoming-agentic",
          sourceSectionId: "section-other",
          targetSectionId: "section-chat",
          kind: "chat_chat",
        }),
      ],
      stateMachineEdges: [
        createWorkflowEdge({
          id: "edge-outgoing-workflow",
          sourceSectionId: "section-chat",
          targetSectionId: "section-next",
        }),
      ],
    });

    const markup = renderHandles("section-chat");

    expectConnectedHandle(
      markup,
      "chat-shared-reverse-start-handle-section-chat",
    );
    expectConnectedHandle(markup, "chat-shared-target-handle-section-chat");
    expectConnectedHandle(markup, "chat-shared-source-handle-section-chat");
  });

  it("keeps the source handle disconnected when only incoming shared chat edges exist", () => {
    seedSharedChatEdges({
      stateMachineEdges: [
        createWorkflowEdge({
          id: "edge-incoming-workflow",
          sourceSectionId: "section-other",
          targetSectionId: "section-chat",
        }),
      ],
    });

    const markup = renderHandles("section-chat");

    expectConnectedHandle(
      markup,
      "chat-shared-reverse-start-handle-section-chat",
    );
    expectConnectedHandle(markup, "chat-shared-target-handle-section-chat");
    expectUnconnectedHandle(markup, "chat-shared-source-handle-section-chat");
  });

  it("suppresses shared chat handles in user view", () => {
    seedSharedChatEdges();

    const markup = renderHandles("section-chat", true);

    expect(markup).toBe("");
  });
});
