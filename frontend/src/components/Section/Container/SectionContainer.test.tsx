/* @vitest-environment jsdom */

import {
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  resetSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
import {
  act,
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useActiveSectionUI, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainer } from "./SectionContainer";

vi.mock("forks/xyflow/core/contexts/NodeIdContext", () => ({
  NodeIdProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: () => <div data-testid="mock-agentic-edge-handles" />,
}));

vi.mock("./ContainerSwitch", () => ({
  ContainerSwitch: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./ManyNestedSections", () => ({
  MaybeManyNestedSections: () => (
    <div data-testid="mock-many-nested-sections" />
  ),
}));

vi.mock("./SectionContainerCore", () => ({
  SectionContainerCore: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-section-container-core">core:{sectionId}</div>
  ),
}));

function syncStoreInitialState(store: {
  getInitialState?: () => Record<string, unknown>;
  getState: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

type RenderedProfiledContainer = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledContainer(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledContainer> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="section-container-profiler" onRender={onRender}>
        <SectionContainer sectionId="section-1" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("SectionContainer", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        isEditingViewMode: true,
        sectionVariantMap: { "section-1": "variant-1" },
        topLevelSections: {
          "section-1": { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
        viewModes: {
          all: {
            id: "all",
            name: "All",
            visibilityBySectionId: { "section-1": true },
            availableToUsers: true,
          },
        },
        activeViewModeId: "all",
      });
      state.sections = {
        "section-1": createCore({
          id: "section-1",
          name: "Section",
          variants: ["variant-1"],
          defaultVariant: "variant-1",
        }),
      };
      state.sectionVariants = {
        "variant-1": createVariant({
          id: "variant-1",
          name: "Variant",
          impl: "impl-1",
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        "impl-1": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: "impl-1",
          isMinimized: false,
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
    syncStoreInitialState(useActiveSectionUI);
  });

  afterEach(() => {
    resetProjectStores();
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
    document.body.innerHTML = "";
  });

  it("stays out of active-section UI commits when the section is not a joined code-terminal group", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledContainer(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useActiveSectionUI.setState({
          activeIds: ["section-1"],
          selectionGeneration: 1,
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelector('[data-testid="mock-section-container-core"]')
          ?.textContent,
      ).toBe("core:section-1");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("records section-container attribution when canary motion capture is active", async () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledContainer(onRender);

    try {
      expect(
        readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
          .motionAttribution.presentedSceneSectionContainerReactRender.count,
      ).toBeGreaterThan(0);
      expect(
        host.querySelector('[data-testid="mock-section-container-core"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
