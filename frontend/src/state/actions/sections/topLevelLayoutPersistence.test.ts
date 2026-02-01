import { updateNodePositions } from "state/actions/nodeInternals";
import {
  debounced_route_set_top_level_section_layout,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import { useNodeInternals, usePendingOperations, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_top_level_section_layout: vi.fn(),
  };
});

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

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
  const sectionImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: null }),
    {
      id: implId,
      chatId: null,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  );
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.parentSectionMap = { [sectionId]: null };
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

describe("top-level layout persistence", () => {
  beforeEach(async () => {
    resetProjectStores();
    vi.useFakeTimers();
    (globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number })
      .requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
    (globalThis as { cancelAnimationFrame?: (id: number) => void })
      .cancelAnimationFrame = () => {};
    seedProjectState();
    const route_set_top_level_section_layout =
      (await import("utils/generatedEndpoints"))
        .route_set_top_level_section_layout as unknown as vi.Mock;
    route_set_top_level_section_layout.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("reapplies pending layout updates over backend snapshots", () => {
    updateNodePositions([
      {
        id: sectionId,
        position: { x: 100, y: 200 },
        distance: { x: 0, y: 0 },
      },
    ]);

    debounced_route_set_top_level_section_layout();

    expect(usePendingOperations.getState().pending.length).toBe(1);

    const backendState = JSON.parse(
      JSON.stringify(useProjectState.getState()),
    );

    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });

    const layout =
      useProjectState.getState().projectConfig.topLevelSections[sectionId];
    expect(layout.x).toBe(100);
    expect(layout.y).toBe(200);
  });
});
