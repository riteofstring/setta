import {
  debounced_route_set_top_level_section_layout,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import {
  useNodeInternals,
  usePendingOperations,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    setTopLevelSectionLayout: vi.fn(),
  };
});
const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const subSectionId = "section-2";
const subVariantId = "variant-2";
const subImplId = "impl-2";
const subSectionLayout = { x: 40, y: 60, zIndex: 2, w: null, h: null };
function seedProjectState() {
  const sectionCore = createCore({
    id: sectionId,
    name: "Chat",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Chat Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createChatSectionImpl({
    ...{ chatId: null },
    ...{
      id: implId,
      chatId: null,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  });
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.projectConfig.topLevelSections = {
      [sectionId]: { x: 0, y: 0, zIndex: 1, w: null, h: null },
    };
    state.previewSectionVariantMap = {};
  });
  useNodeInternals.setState({
    x: new Map([
      [
        sectionId,
        {
          id: sectionId,
          position: { x: 0, y: 0 },
          width: null,
          height: null,
          zIndex: 1,
          tempZIndex: 1,
        },
      ],
    ]),
  });
}
function buildSubAgentEntries() {
  const sectionCore = createCore({
    id: subSectionId,
    name: "Sub-agent",
    variants: [subVariantId],
    defaultVariant: subVariantId,
  });
  const sectionVariant = createVariant({
    id: subVariantId,
    name: "Sub-agent Variant",
    impl: subImplId,
    nonPresetImpls: [],
  });
  const sectionImpl = createChatSectionImpl({
    ...{ chatId: null },
    ...{
      id: subImplId,
      chatId: null,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  });
  return { sectionCore, sectionVariant, sectionImpl };
}
function addSubAgentEntriesToState(
  state: ReturnType<typeof useProjectState.getState>,
) {
  const { sectionCore, sectionVariant, sectionImpl } = buildSubAgentEntries();
  state.sections = { ...state.sections, [subSectionId]: sectionCore };
  state.sectionVariants = {
    ...state.sectionVariants,
    [subVariantId]: sectionVariant,
  };
  state.sectionImpls = { ...state.sectionImpls, [subImplId]: sectionImpl };
  state.projectConfig.sectionVariantMap = {
    ...state.projectConfig.sectionVariantMap,
    [subSectionId]: subVariantId,
  };
  state.parentSectionMap = {
    ...state.parentSectionMap,
    [subSectionId]: null,
  };
  state.projectConfig.topLevelSections = {
    ...state.projectConfig.topLevelSections,
    [subSectionId]: subSectionLayout,
  };
}
function addSubAgentSection() {
  useProjectState.setState((state) => {
    addSubAgentEntriesToState(state);
  });
  useNodeInternals.setState((state) => ({
    x: new Map([
      ...state.x,
      [
        subSectionId,
        {
          id: subSectionId,
          position: { x: subSectionLayout.x, y: subSectionLayout.y },
          width: null,
          height: null,
          zIndex: subSectionLayout.zIndex,
          tempZIndex: subSectionLayout.zIndex,
        },
      ],
    ]),
  }));
}
describe("top-level layout persistence", () => {
  beforeEach(async () => {
    resetProjectStores();
    seedProjectState();
    vi.useFakeTimers();
    const setTopLevelSectionLayout = (await import("openapi/http"))
      .setTopLevelSectionLayout as unknown as vi.Mock;
    setTopLevelSectionLayout.mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => {
    resetProjectStores();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it("reapplies pending layout positions over backend updates", () => {
    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    useNodeInternals.setState((state) => {
      const nextNodes = new Map(state.x);
      const node = nextNodes.get(sectionId);
      if (!node) {
        return { x: nextNodes };
      }
      nextNodes.set(sectionId, {
        ...node,
        position: { x: 120, y: 240 },
      });
      return { x: nextNodes };
    });
    debounced_route_set_top_level_section_layout();
    vi.runAllTimers();
    expect(usePendingOperations.getState().pending.length).toBe(1);
    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });
    const topLevel =
      useProjectState.getState().projectConfig.topLevelSections[sectionId];
    expect(topLevel.x).toBe(120);
    expect(topLevel.y).toBe(240);
    const node = useNodeInternals.getState().x.get(sectionId);
    expect(node?.position.x).toBe(120);
    expect(node?.position.y).toBe(240);
  });
  it("keeps newly created section moves over backend updates", () => {
    addSubAgentSection();
    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    useNodeInternals.setState((state) => {
      const nextNodes = new Map(state.x);
      const node = nextNodes.get(subSectionId);
      if (!node) {
        return { x: nextNodes };
      }
      nextNodes.set(subSectionId, {
        ...node,
        position: { x: 260, y: 180 },
      });
      return { x: nextNodes };
    });
    debounced_route_set_top_level_section_layout();
    vi.runAllTimers();
    expect(usePendingOperations.getState().pending.length).toBe(1);
    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });
    const topLevel =
      useProjectState.getState().projectConfig.topLevelSections[subSectionId];
    expect(topLevel.x).toBe(260);
    expect(topLevel.y).toBe(180);
  });
  it("does not drop new sections when pending layout is stale", () => {
    useNodeInternals.setState((state) => {
      const nextNodes = new Map(state.x);
      const node = nextNodes.get(sectionId);
      if (!node) {
        return { x: nextNodes };
      }
      nextNodes.set(sectionId, {
        ...node,
        position: { x: 30, y: 30 },
      });
      return { x: nextNodes };
    });
    debounced_route_set_top_level_section_layout();
    vi.runAllTimers();
    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    addSubAgentEntriesToState(backendState);
    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });
    const nextLayouts =
      useProjectState.getState().projectConfig.topLevelSections;
    expect(nextLayouts[subSectionId]).toBeTruthy();
  });
});
