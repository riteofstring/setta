import { renderToStaticMarkup } from "react-dom/server";
import { GraphSurfaceImplementationProvider } from "forks/xyflow/core/container/graphSurfaceImplementation";
import { CANVAS_OWNED_SECTION_SHELL_ID } from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createCallableSectionImpl,
  createCore,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({
    content,
    title,
  }: {
    content?: string;
    title?: string;
  }) => ({
    "data-tooltip-content": content ?? title ?? "",
  }),
}));

import { SectionHeader } from "./SectionHeader";

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

describe("SectionHeader motion-hidden trailing controls", () => {
  const sectionId = CANVAS_OWNED_SECTION_SHELL_ID;
  const variantId = "callable-variant-1";
  const implId = "callable-impl-1";

  beforeEach(() => {
    const projectConfig = createProjectConfig({
      id: "project-motion-hidden-header",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.projectConfig.activeViewModeId = "view-mode-1";
      state.projectConfig.isEditingViewMode = false;
      state.projectConfig.viewModes = {
        "view-mode-1": {
          id: "view-mode-1",
          name: "Default",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {
            [sectionId]: true,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            [sectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
          },
        },
      };
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Callable",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        [implId]: createCallableSectionImpl({
          id: implId,
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useActiveSectionUI.setState({
      activeIds: [],
      backendGeneration: 0,
      backendHydrationEnabled: true,
      pendingBackendSyncGenerationByOpId: {},
      pendingBackendSyncOpIds: [],
      scheduledBackendSync: null,
      selectionGeneration: 0,
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useActiveSectionUI);
  });

  afterEach(() => {
    resetProjectStores();
    useActiveSectionUI.setState({
      activeIds: [],
      backendGeneration: 0,
      backendHydrationEnabled: true,
      pendingBackendSyncGenerationByOpId: {},
      pendingBackendSyncOpIds: [],
      scheduledBackendSync: null,
      selectionGeneration: 0,
    });
  });

  function renderHeader({
    motionHiddenInteractionActive = false,
  }: {
    motionHiddenInteractionActive?: boolean;
  } = {}) {
    return renderToStaticMarkup(
      <GraphSurfaceImplementationProvider value="canvas-shell-underlay">
        <SectionHeader
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Callable}
          isInOtherProjectConfigs={false}
          isUserView={false}
          isRoot={false}
          hasSectionStyleTheme={false}
          motionHiddenInteractionActive={motionHiddenInteractionActive}
        />
      </GraphSurfaceImplementationProvider>,
    );
  }

  it("hides trailing controls when the motion-hidden interaction state is active", () => {
    const markup = renderHeader({ motionHiddenInteractionActive: true });

    expect(markup).toContain(
      'data-canvas-owned-motion-header-controls-root="true"',
    );
    expect(markup).toContain(
      'data-canvas-owned-motion-header-controls-hidden="true"',
    );
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("invisible");
  });

  it("hides the lightweight menu trigger when the motion-hidden interaction state is active", () => {
    const markup = renderHeader({ motionHiddenInteractionActive: true });

    expect(markup).toContain(
      'data-canvas-owned-lightweight-menu-trigger="true"',
    );
    expect(markup).toContain(
      'data-canvas-owned-motion-menu-trigger-hidden="true"',
    );
  });

  it("keeps trailing controls visible when the motion-hidden interaction state is inactive", () => {
    const markup = renderHeader();

    expect(markup).toContain(
      'data-canvas-owned-motion-header-controls-root="true"',
    );
    expect(markup).not.toContain(
      'data-canvas-owned-motion-header-controls-hidden="true"',
    );
    expect(markup).not.toContain("pointer-events-none");
    expect(markup).not.toContain(" invisible");
  });

  it("keeps the lightweight menu trigger visible when the motion-hidden interaction state is inactive", () => {
    const markup = renderHeader();

    expect(markup).toContain(
      'data-canvas-owned-lightweight-menu-trigger="true"',
    );
    expect(markup).not.toContain(
      'data-canvas-owned-motion-menu-trigger-hidden="true"',
    );
  });
});
