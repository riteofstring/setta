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
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

const { mockCodeArea } = vi.hoisted(() => ({
  mockCodeArea: vi.fn(({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-code-area">code:{sectionId}</div>
  )),
}));

vi.mock("components/Utils/Resizable/CustomResizable", () => ({
  CustomResizable: ({ children }: { children: ReactNode }) => (
    <section data-testid="mock-custom-resizable">{children}</section>
  ),
}));

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: () => <div data-testid="mock-unified-chat-surface" />,
}));

vi.mock("../Header/SectionHeader", () => ({
  SectionHeader: () => <header data-testid="mock-section-header" />,
}));

vi.mock("../Header/SectionWindowToggleButton", () => ({
  SectionWindowToggleButton: () => (
    <button type="button" data-testid="mock-section-window-toggle" />
  ),
}));

vi.mock("../Layouts/BrowserArea", () => ({
  BrowserArea: () => <div data-testid="mock-browser-area" />,
}));

vi.mock("../Layouts/CallableArea", () => ({
  CallableArea: () => <div data-testid="mock-callable-area" />,
}));

vi.mock("../Layouts/ChartArea/ChartArea", () => ({
  ChartArea: () => <div data-testid="mock-chart-area" />,
}));

vi.mock("../Layouts/CodeArea", () => ({
  CodeArea: mockCodeArea,
  GenPythonCodeArea: () => <div data-testid="mock-gen-python-code-area" />,
  GenPythonMetadataArea: () => (
    <div data-testid="mock-gen-python-metadata-area" />
  ),
}));

vi.mock("../Layouts/DictArea", () => ({
  DictArea: () => <div data-testid="mock-dict-area" />,
}));

vi.mock("../Layouts/DrawArea/DrawArea", () => ({
  DrawArea: () => <div data-testid="mock-draw-area" />,
}));

vi.mock("../Layouts/GlobalVariablesArea", () => ({
  GlobalVariablesArea: () => <div data-testid="mock-global-variables-area" />,
}));

vi.mock("../Layouts/IframeArea", () => ({
  IframeArea: () => <div data-testid="mock-iframe-area" />,
}));

vi.mock("../Layouts/ImageArea", () => ({
  ImageArea: () => <div data-testid="mock-image-area" />,
}));

vi.mock("../Layouts/MetaControlArea", () => ({
  MetaControlArea: () => <div data-testid="mock-meta-control-area" />,
}));

vi.mock("../Layouts/PluginArea", () => ({
  PluginArea: () => <div data-testid="mock-plugin-area" />,
}));

vi.mock("../Layouts/PromptArea", () => ({
  PromptArea: () => <div data-testid="mock-prompt-area" />,
}));

vi.mock("../Layouts/SocialArea", () => ({
  SocialArea: () => <div data-testid="mock-social-area" />,
}));

vi.mock("../Layouts/SpreadsheetArea", () => ({
  SpreadsheetArea: () => <div data-testid="mock-spreadsheet-area" />,
}));

vi.mock("../Layouts/StateMachineNodeArea", () => ({
  StateMachineNodeArea: () => (
    <div data-testid="mock-state-machine-node-area" />
  ),
}));

vi.mock("../Layouts/TaskBoardArea", () => ({
  TaskBoardArea: () => <div data-testid="mock-taskboard-area" />,
}));

vi.mock("../Layouts/TerminalArea", () => ({
  TerminalArea: () => <div data-testid="mock-terminal-area" />,
}));

vi.mock("../Layouts/TextBlock", () => ({
  TextBlock: () => <div data-testid="mock-text-block" />,
  MarkdownCodePre: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("../SectionParts/Incrementer", () => ({
  Incrementer: () => <div data-testid="mock-incrementer" />,
}));

vi.mock("./MetaControlMenuButton", () => ({
  MetaControlMenuButton: () => <div data-testid="mock-meta-control-menu" />,
}));

vi.mock("./TextBlockMetaControlMenuButton", () => ({
  TextBlockMetaControlMenuButton: () => (
    <div data-testid="mock-textblock-meta-control-menu" />
  ),
}));

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
      <Profiler
        id="section-container-core-resizable-profiler"
        onRender={onRender}
      >
        <SectionContainerCoreResizable
          sectionId="section-1"
          sectionTypeName={SectionTypeEnum.Code}
          isInOtherProjectConfigs={false}
          isUserView={false}
          positionAndSizeLocked={false}
          hasSectionStyleTheme={false}
        />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("SectionContainerCoreResizable store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    resetProjectStores();
    mockCodeArea.mockClear();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        isEditingViewMode: true,
        sectionVariantMap: { [sectionId]: variantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
        viewModes: {
          all: {
            id: "all",
            name: "All",
            visibilityBySectionId: { [sectionId]: true },
            availableToUsers: true,
          },
        },
        activeViewModeId: "all",
      });
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Section",
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
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: implId,
          isMinimized: false,
        }),
      };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
  });

  afterEach(() => {
    resetProjectStores();
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
    document.body.innerHTML = "";
  });

  it("stays out of unrelated project-state commits when subscribed container inputs are unchanged", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledContainer(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview-variant writes should not fan into every mounted section container shell.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelector('[data-testid="mock-code-area"]')?.textContent,
      ).toBe("code:section-1");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the subscribed minimized state changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledContainer(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[implId];
          if (!impl || impl.type !== SectionTypeEnum.Code) {
            throw new Error(`Missing code impl ${implId}`);
          }
          impl.isMinimized = true;
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(host.querySelector('[data-testid="mock-code-area"]')).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps mounted body content out of parent-only rerenders when body props stay stable", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <SectionContainerCoreResizable
            sectionId="section-1"
            sectionTypeName={SectionTypeEnum.Code}
            isInOtherProjectConfigs={false}
            isUserView={false}
            positionAndSizeLocked={false}
            hasSectionStyleTheme={false}
          />,
        );
      });

      const initialCodeAreaRenderCount = mockCodeArea.mock.calls.length;

      await act(async () => {
        root.render(
          <SectionContainerCoreResizable
            sectionId="section-1"
            sectionTypeName={SectionTypeEnum.Code}
            isInOtherProjectConfigs={false}
            isUserView={false}
            positionAndSizeLocked={false}
            hasSectionStyleTheme={true}
          />,
        );
      });

      expect(mockCodeArea).toHaveBeenCalledTimes(initialCodeAreaRenderCount);
      expect(
        host.querySelector('[data-testid="mock-code-area"]')?.textContent,
      ).toBe("code:section-1");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("records separate header and body-content attribution when canary motion capture is active", async () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledContainer(onRender);

    try {
      const motionAttribution =
        readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
          .motionAttribution;

      expect(
        motionAttribution.presentedSceneSectionHeaderReactRender.count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution.presentedSceneSectionBodyContentReactRender.count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution.presentedSceneSectionCanvasSectionBodyReactRender
          .count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution.presentedSceneSectionAreaSwitchReactRender.count,
      ).toBeGreaterThan(0);
      expect(
        host.querySelector('[data-testid="mock-section-header"]'),
      ).not.toBeNull();
      expect(
        host.querySelector('[data-testid="mock-code-area"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
