/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useHomeFileBrowserState } from "state/stores/fileBrowserStores";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeWorkspaceBrowserPane } from "./HomeWorkspaceBrowserPane";

const mocks = vi.hoisted(() => ({
  onChange: null as null | ((nextValue: string) => void),
}));

vi.mock("components/Panes/Overview/FileBrowser/FileBrowserPane", () => ({
  FileBrowserPane: () => (
    <div data-testid="mock-file-browser-pane">Browser</div>
  ),
}));

vi.mock("components/Utils/CodeMirror/folderPathCompletions", () => ({
  createDynamicFolderPathCompletionSource: () => undefined,
}));

vi.mock("components/Utils/CodeMirror/InlineCodeMirrorInput", () => ({
  InlineCodeMirrorInput: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (nextValue: string) => void;
  }) => {
    mocks.onChange = onChange;
    return (
      <input data-testid="mock-home-browser-input" value={value} readOnly />
    );
  },
}));

describe("HomeWorkspaceBrowserPane", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.onChange = null;
    useHomeFileBrowserState.getState().reset();
    useHomeFileBrowserState.setState({
      rootPath: "/workspace",
      selectedPath: null,
      expandedPaths: {},
      pathSeparator: "/",
      ignorePatterns: [],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the workspace browser title and file browser surface", () => {
    act(() => {
      root.render(<HomeWorkspaceBrowserPane />);
    });

    expect(container.textContent).toContain("Workspace Browser");
    expect(
      container.querySelector('[data-testid="mock-file-browser-pane"]'),
    ).toBeTruthy();
  });

  it("applies the edited path into the shared home file-browser store", () => {
    act(() => {
      root.render(<HomeWorkspaceBrowserPane />);
    });

    const goButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Go",
    );

    act(() => {
      mocks.onChange?.("/workspace/src");
    });

    act(() => {
      goButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(useHomeFileBrowserState.getState()).toEqual(
      expect.objectContaining({
        rootPath: "/workspace/src",
        selectedPath: "/workspace/src",
        expandedPaths: { "/workspace/src": true },
      }),
    );
  });
});
