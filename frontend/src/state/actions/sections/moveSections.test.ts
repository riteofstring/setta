import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { moveSectionsWithBackend } from "state/actions/sections/moveSections";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let useProjectState: typeof import("state/definitions").useProjectState;
let useNodeInternals: typeof import("state/definitions").useNodeInternals;

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_move_sections: vi.fn(),
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

describe("move section optimistic updates", () => {
  beforeEach(async () => {
    resetProjectStores();
    (
      globalThis as {
        requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      }
    ).requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
    (
      globalThis as { cancelAnimationFrame?: (id: number) => void }
    ).cancelAnimationFrame = () => {};
    const definitions = await import("state/definitions");
    useProjectState = definitions.useProjectState;
    useNodeInternals = definitions.useNodeInternals;
    seedProjectState();
    const route_move_sections = (await import("utils/generatedEndpoints"))
      .route_move_sections as unknown as vi.Mock;
    route_move_sections.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("reapplies pending moves using a stable position snapshot", () => {
    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    const positionsById = { [sectionId]: { x: 100, y: 200 } };

    moveSectionsWithBackend({
      sectionIds: [sectionId],
      newParentId: null,
      newIndex: null,
      positionsById,
    });

    positionsById[sectionId].x = 999;
    positionsById[sectionId].y = 999;

    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });

    const position =
      useProjectState.getState().projectConfig.topLevelSections[sectionId];
    expect(position.x).toBe(100);
    expect(position.y).toBe(200);
  });
});
