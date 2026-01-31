import { renderToStaticMarkup } from "react-dom/server";
import {
  useAIFollow,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createChatSectionImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createTopLevelSectionLayout,
  createUserDefaultChatSectionImpl,
  createUserDefaultDictSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import type { Node } from "../types";
import AgenticEdgeRenderer from "./AgenticEdgeRenderer";

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

describe("AgenticEdgeRenderer", () => {
  const projectConfigId = "project-1";
  const chatSectionId = "section-chat";
  const contextSectionId = "section-context";
  const scopeSectionId = "section-scope";
  const chatVariantId = "variant-chat";
  const contextVariantId = "variant-context";
  const scopeVariantId = "variant-scope";
  const chatImplId = "impl-chat";
  const contextImplId = "impl-context";
  const scopeImplId = "impl-scope";

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState, width: 900, height: 600 });
    syncStoreInitialState(useReactFlow);

    const chatImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ waitingForResponse: true }),
      { id: chatImplId, waitingForResponse: true },
    );
    const dictDefaults = createUserDefaultDictSectionImpl();
    const contextImpl = createDictSectionImpl(dictDefaults, {
      id: contextImplId,
    });
    const scopeImpl = createDictSectionImpl(dictDefaults, { id: scopeImplId });

    const chatVariant = createVariant({
      id: chatVariantId,
      name: "Chat Variant",
      impl: chatImplId,
      nonPresetImpls: [],
    });
    const contextVariant = createVariant({
      id: contextVariantId,
      name: "Context Variant",
      impl: contextImplId,
      nonPresetImpls: [],
    });
    const scopeVariant = createVariant({
      id: scopeVariantId,
      name: "Scope Variant",
      impl: scopeImplId,
      nonPresetImpls: [],
    });

    const agenticEdges = [
      createAgenticEdge({
        id: "edge-run",
        sourceSectionId: chatSectionId,
        targetSectionId: scopeSectionId,
        kind: AgenticEdgeKindEnum.chat_section,
      }),
      createAgenticEdge({
        id: "edge-tool",
        sourceSectionId: contextSectionId,
        targetSectionId: chatSectionId,
        kind: AgenticEdgeKindEnum.section_chat,
      }),
    ];

    const projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: {
        [chatSectionId]: chatVariantId,
        [contextSectionId]: contextVariantId,
        [scopeSectionId]: scopeVariantId,
      },
      topLevelSections: {
        [chatSectionId]: createTopLevelSectionLayout({
          x: 100,
          y: 80,
          w: 220,
          h: 140,
        }),
        [contextSectionId]: createTopLevelSectionLayout({
          x: 420,
          y: 70,
          w: 200,
          h: 120,
        }),
        [scopeSectionId]: createTopLevelSectionLayout({
          x: 420,
          y: 280,
          w: 200,
          h: 120,
        }),
      },
      agenticEdges,
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = {
        [chatSectionId]: createCore({
          id: chatSectionId,
          name: "Chat",
          variants: [chatVariantId],
          defaultVariant: chatVariantId,
        }),
        [contextSectionId]: createCore({
          id: contextSectionId,
          name: "Context",
          variants: [contextVariantId],
          defaultVariant: contextVariantId,
        }),
        [scopeSectionId]: createCore({
          id: scopeSectionId,
          name: "Scope",
          variants: [scopeVariantId],
          defaultVariant: scopeVariantId,
        }),
      };
      state.sectionVariants = {
        [chatVariantId]: chatVariant,
        [contextVariantId]: contextVariant,
        [scopeVariantId]: scopeVariant,
      };
      state.sectionImpls = {
        [chatImplId]: chatImpl,
        [contextImplId]: contextImpl,
        [scopeImplId]: scopeImpl,
      };
      state.previewSectionVariantMap = {};
    });

    useAIFollow.setState({
      toolArgumentsIdsByProjectConfigId: {
        [projectConfigId]: {
          "run-1": { section: [contextSectionId] },
        },
      },
      toolResultIdsByProjectConfigId: {
        [projectConfigId]: {
          "run-2": { section: [scopeSectionId] },
        },
      },
    });

    const nodes = new Map<string, Node>();
    nodes.set(chatSectionId, {
      id: chatSectionId,
      position: { x: 100, y: 80 },
      width: 220,
      height: 140,
      zIndex: 0,
      tempZIndex: 0,
    });
    nodes.set(contextSectionId, {
      id: contextSectionId,
      position: { x: 420, y: 70 },
      width: 200,
      height: 120,
      zIndex: 0,
      tempZIndex: 0,
    });
    nodes.set(scopeSectionId, {
      id: scopeSectionId,
      position: { x: 420, y: 280 },
      width: 200,
      height: 120,
      zIndex: 0,
      tempZIndex: 0,
    });
    useNodeInternals.setState({ x: nodes });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAIFollow);
    syncStoreInitialState(useNodeInternals);
  });

  afterEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("highlights edges based on run and AIFollow updates", () => {
    const markup = renderToStaticMarkup(<AgenticEdgeRenderer />);

    expect(markup).toContain("agentic-edge--tool-args");
    expect(markup).toContain("agentic-edge--tool-result");
    expect(markup).toContain("agentic-edge--run");
  });
});
