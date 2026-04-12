/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialReactFlowState from "forks/xyflow/core/store/initialState";
import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("forks/xyflow/core/components/Handle", () => ({
  Handle: ({ className, id }: { className?: string; id?: string }) => (
    <div data-testid={id ?? "handle"} className={className} />
  ),
}));

vi.mock("forks/xyflow/core/contexts/NodeIdContext", () => ({
  useNodeId: () => "section-a",
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({ canEditStructure: true }),
}));

vi.mock("state/actions/agenticEdges", () => ({
  AGENTIC_EDGE_HANDLE_IDS: {
    reverseStart: "agentic-reverse-start",
    target: "agentic-target",
    source: "agentic-source",
  },
  createAgenticEdgeFromConnection: vi.fn(),
  isValidAgenticEdgeConnection: vi.fn(),
}));

vi.mock("state/actions/stateMachineEdges", () => ({
  STATE_MACHINE_EDGE_HANDLE_IDS: {
    reverseStart: "workflow-reverse-start",
    target: "workflow-target",
    source: "workflow-source",
  },
  createStateMachineEdgeFromConnection: vi.fn(),
  isValidStateMachineEdgeConnection: vi.fn(),
}));

vi.mock("state/actions/chatSharedHandleIds", () => ({
  SHARED_CHAT_EDGE_HANDLE_IDS: {
    reverseStart: "chat-shared-reverse-start",
    target: "chat-shared-target",
    source: "chat-shared-source",
  },
}));

vi.mock("state/actions/chatSharedEdges", () => ({
  createSharedChatEdgeFromConnection: vi.fn(),
  getChatSharedEdgeModeLabel: () => "Workflow",
  isValidSharedChatEdgeConnection: vi.fn(),
}));

type MockProjectState = {
  projectConfig: {
    agenticEdges: Array<{ sourceSectionId: string; targetSectionId: string }>;
    stateMachineEdges: Array<{
      sourceSectionId: string;
      targetSectionId: string;
    }>;
    sectionVariantMap: Record<string, string>;
  };
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<string, { type: SectionTypeEnum }>;
};

let mockProjectState: MockProjectState;

vi.mock("state/definitions", () => ({
  useLocalStorage: (
    selector: (state: { chatSharedEdgeMode: string }) => unknown,
  ) => selector({ chatSharedEdgeMode: "workflow" }),
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";

type RenderedComponent = {
  host: HTMLDivElement;
  root: Root;
};

function createConnectingHandle() {
  return {
    handleId: "agentic-source",
    sectionId: "section-a",
    type: "source" as const,
  };
}

async function renderWithProfiler(
  component: JSX.Element,
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedComponent> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="edge-handles-profiler" onRender={onRender}>
        {component}
      </Profiler>,
    );
  });

  return { host, root };
}

describe("EdgeHandles", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        agenticEdges: [
          { sourceSectionId: "section-a", targetSectionId: "section-b" },
        ],
        stateMachineEdges: [
          { sourceSectionId: "section-a", targetSectionId: "section-b" },
        ],
        sectionVariantMap: {
          "section-a": "variant-a",
        },
      },
      sectionVariants: {
        "variant-a": { impl: "impl-a" },
      },
      sectionImpls: {
        "impl-a": { type: SectionTypeEnum.Chat },
      },
    };
    useReactFlow.setState({
      ...initialReactFlowState,
      connectionStartHandle: null,
    });
  });

  afterEach(() => {
    useReactFlow.setState({ ...initialReactFlowState });
    document.body.innerHTML = "";
  });

  it("keeps agentic edge handles out of connection-start commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderWithProfiler(
      <AgenticEdgeHandles isUserView={false} />,
      onRender,
    );

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useReactFlow.setState({
          connectionStartHandle: createConnectingHandle(),
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.querySelectorAll(".agentic-handle--selecting")).toHaveLength(
        0,
      );
      expect(host.querySelectorAll(".agentic-handle")).toHaveLength(3);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps chat-shared edge handles out of connection-start commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderWithProfiler(
      <ChatSharedEdgeHandles isUserView={false} />,
      onRender,
    );

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useReactFlow.setState({
          connectionStartHandle: createConnectingHandle(),
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.querySelectorAll(".agentic-handle--selecting")).toHaveLength(
        0,
      );
      expect(host.querySelectorAll(".agentic-handle")).toHaveLength(3);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps workflow edge handles out of connection-start commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderWithProfiler(
      <StateMachineEdgeHandles isUserView={false} />,
      onRender,
    );

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useReactFlow.setState({
          connectionStartHandle: createConnectingHandle(),
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.querySelectorAll(".agentic-handle--selecting")).toHaveLength(
        0,
      );
      expect(host.querySelectorAll(".agentic-handle")).toHaveLength(3);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
