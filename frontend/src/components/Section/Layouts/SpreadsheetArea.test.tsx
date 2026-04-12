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
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  SpreadsheetAreaShell,
  SpreadsheetGlideEditor,
} from "./SpreadsheetArea";

describe("SpreadsheetArea", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
});
