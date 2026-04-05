import { renderToStaticMarkup } from "react-dom/server";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createPromptSectionImpl,
  createTopLevelSectionLayout,
  createUserDefaultChatSectionImpl,
  createUserDefaultPromptSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import type { Node } from "../types";
import StateMachineEdgeRenderer from "./StateMachineEdgeRenderer";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

describe("StateMachineEdgeRenderer", () => {
  const projectConfigId = "project-1";
  const sourceSectionId = "section-source";
  const targetSectionId = "section-target";
  const hiddenTargetSectionId = "section-hidden";
  const promptSectionId = "section-prompt";
  const sourceVariantId = "variant-source";
  const targetVariantId = "variant-target";
  const hiddenVariantId = "variant-hidden";
  const promptVariantId = "variant-prompt";
  const sourceImplId = "impl-source";
  const targetImplId = "impl-target";
  const hiddenImplId = "impl-hidden";
  const promptImplId = "impl-prompt";

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState, width: 900, height: 600 });
    syncStoreInitialState(useReactFlow);

    const sourceImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId: "chat-source" }),
      {
        id: sourceImplId,
        chatId: "chat-source",
        managed: true,
        engineConfigId: "engine-a",
        thinking: false,
      },
    );
    const targetImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId: "chat-target" }),
      {
        id: targetImplId,
        chatId: "chat-target",
        managed: true,
        engineConfigId: "engine-b",
        thinking: false,
      },
    );
    const hiddenImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId: "chat-hidden" }),
      {
        id: hiddenImplId,
        chatId: "chat-hidden",
        managed: true,
        engineConfigId: "engine-c",
        thinking: false,
      },
    );
    const promptImpl = createPromptSectionImpl(
      createUserDefaultPromptSectionImpl({
        template: "Hi {{ name }}",
      }),
      {
        id: promptImplId,
        template: "Hi {{ name }}",
      },
    );

    const sourceVariant = createVariant({
      id: sourceVariantId,
      name: "Source Variant",
      impl: sourceImplId,
      nonPresetImpls: [],
    });
    const targetVariant = createVariant({
      id: targetVariantId,
      name: "Target Variant",
      impl: targetImplId,
      nonPresetImpls: [],
    });
    const hiddenVariant = createVariant({
      id: hiddenVariantId,
      name: "Hidden Variant",
      impl: hiddenImplId,
      nonPresetImpls: [],
    });
    const promptVariant = createVariant({
      id: promptVariantId,
      name: "Prompt Variant",
      impl: promptImplId,
      nonPresetImpls: [],
    });

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: projectConfigId,
        sectionVariantMap: {
          [sourceSectionId]: sourceVariantId,
          [targetSectionId]: targetVariantId,
          [hiddenTargetSectionId]: hiddenVariantId,
          [promptSectionId]: promptVariantId,
        },
        topLevelSections: {
          [sourceSectionId]: createTopLevelSectionLayout({
            x: 120,
            y: 80,
            w: 220,
            h: 140,
          }),
          [targetSectionId]: createTopLevelSectionLayout({
            x: 460,
            y: 80,
            w: 220,
            h: 140,
          }),
          [hiddenTargetSectionId]: createTopLevelSectionLayout({
            x: 460,
            y: 300,
            w: 220,
            h: 140,
          }),
          [promptSectionId]: createTopLevelSectionLayout({
            x: 200,
            y: 300,
            w: 220,
            h: 140,
          }),
        },
        stateMachineEdges: [
          {
            id: "edge-visible",
            machineGroupId: "workflow-main",
            sourceSectionId,
            sourcePortId: "workflow-source",
            targetSectionId,
            targetPortId: "workflow-target",
            sourceFilter: {
              type: "signal",
              signalName: "merge_decision",
              payloadField: "decision",
              equals: "retry",
            },
            sourceActivationCountCondition: {
              operator: "lt",
              value: 2,
            },
            targetAction: {
              type: "send_prompt",
              promptTemplateId: null,
              promptSectionId,
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
            zIndex: 1,
            selected: true,
          },
          {
            id: "edge-hidden",
            machineGroupId: "workflow-main",
            sourceSectionId,
            sourcePortId: "workflow-source",
            targetSectionId: hiddenTargetSectionId,
            targetPortId: "workflow-target",
            sourceFilter: {
              type: "run_completed",
              signalName: null,
              payloadField: null,
              equals: null,
            },
            sourceActivationCountCondition: null,
            targetAction: null,
            style: null,
            hidden: true,
            zIndex: 0,
            selected: false,
          },
        ],
      });
      state.sections = {
        [sourceSectionId]: createCore({
          id: sourceSectionId,
          name: "Source",
          variants: [sourceVariantId],
          defaultVariant: sourceVariantId,
        }),
        [targetSectionId]: createCore({
          id: targetSectionId,
          name: "Target",
          variants: [targetVariantId],
          defaultVariant: targetVariantId,
        }),
        [hiddenTargetSectionId]: createCore({
          id: hiddenTargetSectionId,
          name: "Hidden",
          variants: [hiddenVariantId],
          defaultVariant: hiddenVariantId,
        }),
        [promptSectionId]: createCore({
          id: promptSectionId,
          name: "Prompt",
          variants: [promptVariantId],
          defaultVariant: promptVariantId,
        }),
      };
      state.sectionVariants = {
        [sourceVariantId]: sourceVariant,
        [targetVariantId]: targetVariant,
        [hiddenVariantId]: hiddenVariant,
        [promptVariantId]: promptVariant,
      };
      state.sectionImpls = {
        [sourceImplId]: sourceImpl,
        [targetImplId]: targetImpl,
        [hiddenImplId]: hiddenImpl,
        [promptImplId]: promptImpl,
      };
      state.previewSectionVariantMap = {};
    });

    const nodes = new Map<string, Node>();
    nodes.set(sourceSectionId, {
      id: sourceSectionId,
      position: { x: 120, y: 80 },
      width: 220,
      height: 140,
      zIndex: 0,
      tempZIndex: 0,
    });
    nodes.set(targetSectionId, {
      id: targetSectionId,
      position: { x: 460, y: 80 },
      width: 220,
      height: 140,
      zIndex: 0,
      tempZIndex: 0,
    });
    nodes.set(hiddenTargetSectionId, {
      id: hiddenTargetSectionId,
      position: { x: 460, y: 300 },
      width: 220,
      height: 140,
      zIndex: 0,
      tempZIndex: 0,
    });
    nodes.set(promptSectionId, {
      id: promptSectionId,
      position: { x: 200, y: 300 },
      width: 220,
      height: 140,
      zIndex: 0,
      tempZIndex: 0,
    });
    useNodeInternals.setState({ x: nodes });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useNodeInternals);
  });

  afterEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("renders workflow edges without action-specific style classes", () => {
    const markup = renderToStaticMarkup(<StateMachineEdgeRenderer />);

    expect(markup).toContain("workflow-edge--selected");
    expect(markup).toContain('data-testid="workflow-prompt-link-edge-visible"');
    expect(markup).toContain(
      'data-testid="workflow-edge-source-activation-badge-edge-visible"',
    );
    expect(markup).toContain("src count &lt; 2");
    expect(markup).not.toContain("workflow-edge--signal");
    expect(markup).not.toContain("workflow-edge--reset-thread");
    expect(markup).not.toContain("workflow-edge--send-prompt");
    expect(markup).toContain('data-edgeid="edge-visible"');
    expect(markup).not.toContain('data-edgeid="edge-hidden"');
  });
});
