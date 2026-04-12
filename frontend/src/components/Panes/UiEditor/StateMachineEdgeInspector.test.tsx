/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createStateMachineStartSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateMachineEdgeInspector } from "./StateMachineEdgeInspector";

const replaceStateMachineEdgeMock = vi.fn();
const deleteSelectedStateMachineEdgesMock = vi.fn();

vi.mock(
  "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState",
  () => ({
    useHydrateAgenticState: () => undefined,
  }),
);

vi.mock("components/Utils/Combobox/IdNameCombobox", () => ({
  IdNameCombobox: () => <div data-testid="mock-id-name-combobox" />,
}));

vi.mock("state/actions/stateMachineEdges", () => ({
  deleteSelectedStateMachineEdges: () => deleteSelectedStateMachineEdgesMock(),
  replaceStateMachineEdge: (...args: unknown[]) =>
    replaceStateMachineEdgeMock(...args),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: true,
    canEditParams: true,
    canEditStructure: true,
  }),
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

function seedWorkflowEdgeState() {
  const projectId = "project-1";
  const startSectionId = "section-start";
  const chatSectionId = "section-chat";
  const startVariantId = "variant-start";
  const chatVariantId = "variant-chat";
  const startImplId = "impl-start";
  const chatImplId = "impl-chat";

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectId,
      sectionVariantMap: {
        [startSectionId]: startVariantId,
        [chatSectionId]: chatVariantId,
      },
      stateMachineEdges: [
        {
          id: "edge-existing",
          machineGroupId: "workflow-main",
          sourceSectionId: startSectionId,
          sourcePortId: "workflow-source",
          targetSectionId: chatSectionId,
          targetPortId: "workflow-target",
          sourceFilter: null,
          sourceActivationCountCondition: null,
          targetAction: {
            type: "reset_thread",
            promptTemplateId: null,
            promptSectionId: null,
            inlinePrompt: null,
            promptInputs: {},
            threadStrategy: "continue_current_thread",
            stopIfRunning: false,
            engineConfigId: null,
            agentProfileId: null,
            permissionMode: null,
            searchEnabled: null,
          },
          style: null,
          hidden: false,
          zIndex: 0,
          selected: true,
        },
      ],
    });
    state.sections = {
      [startSectionId]: createCore({
        id: startSectionId,
        name: "Start",
        variants: [startVariantId],
        defaultVariant: startVariantId,
      }),
      [chatSectionId]: createCore({
        id: chatSectionId,
        name: "Chat",
        variants: [chatVariantId],
        defaultVariant: chatVariantId,
      }),
    };
    state.sectionVariants = {
      [startVariantId]: createVariant({
        id: startVariantId,
        name: "Start Variant",
        impl: startImplId,
        nonPresetImpls: [],
      }),
      [chatVariantId]: createVariant({
        id: chatVariantId,
        name: "Chat Variant",
        impl: chatImplId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [startImplId]: createStateMachineStartSectionImpl({
        id: startImplId,
        name: "Start",
        machineGroupId: "workflow-main",
        label: "Start",
      }),
      [chatImplId]: createChatSectionImpl({
        id: chatImplId,
        name: "Chat",
      }),
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);

  useAIStore.setState({
    promptTemplates: [],
    engineConfigs: [],
  });
  syncStoreInitialState(useAIStore);

  useShareSession.setState({ isDeploymentMode: false });
  syncStoreInitialState(useShareSession);
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("StateMachineEdgeInspector", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    replaceStateMachineEdgeMock.mockReset();
    deleteSelectedStateMachineEdgesMock.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    seedWorkflowEdgeState();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("shows backend validation detail instead of recomputing edge rules locally", async () => {
    replaceStateMachineEdgeMock.mockResolvedValue({
      status: 422,
      hasResponse: true,
      data: {
        detail:
          "State machine edge edge-existing reset_thread actions cannot include prompt content or prompt inputs.",
      },
    });

    await act(async () => {
      root.render(<StateMachineEdgeInspector edgeId="edge-existing" />);
    });

    const stopIfRunning = host.querySelector(
      '[data-testid="workflow-edge-stop-if-running"]',
    ) as HTMLInputElement | null;
    expect(stopIfRunning).not.toBeNull();

    await act(async () => {
      stopIfRunning?.click();
    });

    const applyButton = host.querySelector(
      '[data-testid="workflow-edge-apply"]',
    ) as HTMLButtonElement | null;
    expect(applyButton?.disabled).toBe(false);

    await act(async () => {
      applyButton?.click();
    });
    await flushEffects();

    const error = host.querySelector(
      '[data-testid="workflow-edge-validation-error"]',
    );
    expect(error?.textContent).toBe(
      "State machine edge edge-existing reset_thread actions cannot include prompt content or prompt inputs.",
    );
    expect(applyButton?.disabled).toBe(false);
  });
});
