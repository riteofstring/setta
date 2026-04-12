/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialReactFlowState from "forks/xyflow/core/store/initialState";
import {
  act,
  createElement,
  Profiler,
  type ProfilerOnRenderCallback,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createSectionSize,
  createVariant,
  SectionTypeEnum,
  SpreadsheetGridDensityEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: true,
  }),
}));

vi.mock(
  "components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor",
  () => ({
    FileBrowserSpreadsheetEditor: ({
      autoReloadOnExternalChange,
      density,
      flowZoom,
      readOnly,
      selectedFile,
      showRowNumbers,
    }: {
      autoReloadOnExternalChange: boolean;
      density: string;
      flowZoom: number;
      readOnly: boolean;
      selectedFile: { fullPath: string; name: string } | null;
      showRowNumbers: boolean;
    }) => (
      <div
        data-testid="mock-spreadsheet-editor"
        data-auto-reload={autoReloadOnExternalChange ? "true" : "false"}
        data-density={density}
        data-flow-zoom={String(flowZoom)}
        data-read-only={readOnly ? "true" : "false"}
        data-selected-path={selectedFile?.fullPath ?? ""}
        data-show-row-numbers={showRowNumbers ? "true" : "false"}
      />
    ),
  }),
);

import {
  SpreadsheetArea,
  SpreadsheetAreaShell,
  SpreadsheetGlideEditor,
} from "./SpreadsheetArea";

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

function seedSpreadsheetSection() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: "Spreadsheet",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl: BaseSectionImplUnion = {
    type: SectionTypeEnum.Spreadsheet,
    id: implId,
    name: "Spreadsheet",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: createSectionSize({ width: 320, height: 240 }),
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    filePath: "/tmp/example.csv",
    activeSheet: "Sheet1",
    readOnly: false,
    showRowNumbers: true,
    density: SpreadsheetGridDensityEnum.comfortable,
    autoReloadOnExternalChange: true,
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);

  return { implId, sectionId };
}

describe("SpreadsheetArea", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      ...initialReactFlowState,
      transform: [0, 0, 1],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    useReactFlow.setState({ ...initialReactFlowState });
  });

  it("keeps the spreadsheet shell out of React Flow zoom commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="spreadsheet-area-shell" onRender={onRender}>
          <SpreadsheetAreaShell
            isDropTargetActive={false}
            onDragLeave={vi.fn()}
            onDragOver={vi.fn()}
            onDrop={vi.fn()}
          >
            <div data-testid="spreadsheet-shell-child" />
          </SpreadsheetAreaShell>
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 1.75] });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
  });

  it("updates only the glide editor flowZoom input when React Flow zoom changes", async () => {
    await act(async () => {
      root.render(
        createElement(SpreadsheetGlideEditor, {
          autoReloadOnExternalChange: true,
          density: "comfortable",
          readOnly: false,
          selectedFile: {
            fullPath: "/tmp/example.csv",
            name: "example.csv",
          },
          showRowNumbers: true,
        }),
      );
    });

    await vi.waitFor(() => {
      expect(
        host.querySelector<HTMLElement>(
          '[data-testid="mock-spreadsheet-editor"]',
        )?.dataset.flowZoom,
      ).toBe("1");
    });

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2.5] });
    });

    await vi.waitFor(() => {
      const editor = host.querySelector<HTMLElement>(
        '[data-testid="mock-spreadsheet-editor"]',
      );
      expect(editor?.dataset.flowZoom).toBe("2.5");
      expect(editor?.dataset.selectedPath).toBe("/tmp/example.csv");
      expect(editor?.dataset.density).toBe("comfortable");
    });
  });

  it("stays out of unrelated project-state commits when spreadsheet inputs are unchanged", async () => {
    const { sectionId } = seedSpreadsheetSection();
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="spreadsheet-area-profiler" onRender={onRender}>
          <SpreadsheetArea sectionId={sectionId} />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      // Unrelated preview-variant churn should not re-commit mounted spreadsheet bodies.
      useProjectState.setState((state) => {
        state.previewSectionVariantMap = {
          otherSection: "other-variant",
        };
      });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
    expect(
      host.querySelector<HTMLElement>('[data-testid="mock-spreadsheet-editor"]')
        ?.dataset.selectedPath,
    ).toBe("/tmp/example.csv");
  });

  it("rerenders when the subscribed spreadsheet density changes", async () => {
    const { implId, sectionId } = seedSpreadsheetSection();
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="spreadsheet-area-profiler" onRender={onRender}>
          <SpreadsheetArea sectionId={sectionId} />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      // The mounted spreadsheet body must still update when its own grid density changes.
      useProjectState.setState((state) => {
        const impl = state.sectionImpls[implId];
        if (impl.type !== SectionTypeEnum.Spreadsheet) {
          throw new Error("Expected Spreadsheet section impl.");
        }
        impl.density = SpreadsheetGridDensityEnum.compact;
      });
    });

    expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
    expect(
      host.querySelector<HTMLElement>('[data-testid="mock-spreadsheet-editor"]')
        ?.dataset.density,
    ).toBe("compact");
  });
});
