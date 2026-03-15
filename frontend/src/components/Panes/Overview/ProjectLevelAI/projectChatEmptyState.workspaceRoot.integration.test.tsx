/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_file_browser_root: vi.fn(),
    route_get_folder_contents: vi.fn(),
  };
});

import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import { ProjectChatEmptyState } from "./projectChatEmptyState";
import { buildCreateProjectStarterPrompt } from "./projectChatStarterPrompts";

describe("ProjectChatEmptyState workspace root scans", () => {
  let host: HTMLDivElement;
  let root: Root;

  function getCreateProjectButton(): HTMLButtonElement {
    const button = Array.from(host.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Create Project",
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Expected the create-project starter button to render.");
    }
    return button;
  }

  async function renderProjectChatEmptyState({
    strictMode = false,
    onStarterPrompt = vi.fn(),
  }: {
    strictMode?: boolean;
    onStarterPrompt?: (prompt: string) => void;
  } = {}) {
    const content = (
      <ProjectChatEmptyState
        projectConfigId="project-1"
        disabled={false}
        onStarterPrompt={onStarterPrompt}
      />
    );

    await act(async () => {
      root.render(strictMode ? <StrictMode>{content}</StrictMode> : content);
    });
    return { onStarterPrompt };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    vi.mocked(route_get_file_browser_root).mockResolvedValue({
      data: {
        rootPath: "/workspace",
        pathSeparator: "/",
        ignorePatterns: [],
      },
      status: 200,
      hasResponse: true,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
  });

  it("does not start a second workspace root scan while the first scan is still in flight", async () => {
    let resolveFolderScan:
      | ((value: {
          data: Array<{ name: string; type: string; fullPath: string }>;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;

    vi.mocked(route_get_folder_contents).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFolderScan = resolve;
        }),
    );

    renderProjectChatEmptyState();

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6200);
    });

    expect(route_get_folder_contents).toHaveBeenCalledTimes(1);

    if (!resolveFolderScan) {
      throw new Error(
        "Expected the initial workspace root scan to be pending.",
      );
    }
    resolveFolderScan({
      data: [],
      status: 200,
      hasResponse: true,
    });
  });

  it("backs off stable root polling under StrictMode after repeated identical roots", async () => {
    vi.mocked(route_get_folder_contents).mockResolvedValue({
      data: [],
      status: 200,
      hasResponse: true,
    });

    renderProjectChatEmptyState({ strictMode: true });

    await vi.waitFor(() => {
      expect(route_get_file_browser_root).toHaveBeenCalled();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16200);
    });
    const postBackoffTransitionCalls = vi.mocked(route_get_file_browser_root)
      .mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6200);
    });

    expect(vi.mocked(route_get_file_browser_root).mock.calls.length).toBe(
      postBackoffTransitionCalls,
    );
  });

  it("adapts the create-project starter prompt when the workspace root has no python signals", async () => {
    const onStarterPrompt = vi.fn();
    vi.mocked(route_get_file_browser_root).mockResolvedValue({
      data: {
        rootPath: "/workspace/no-python",
        pathSeparator: "/",
        ignorePatterns: [],
      },
      status: 200,
      hasResponse: true,
    });
    vi.mocked(route_get_folder_contents).mockResolvedValue({
      data: [],
      status: 200,
      hasResponse: true,
    });

    renderProjectChatEmptyState({ onStarterPrompt });

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      getCreateProjectButton().dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onStarterPrompt).toHaveBeenCalledWith(
      buildCreateProjectStarterPrompt(false),
    );
  });

  it("keeps the codebase-first starter prompt when the workspace root has python signals", async () => {
    const onStarterPrompt = vi.fn();
    vi.mocked(route_get_file_browser_root).mockResolvedValue({
      data: {
        rootPath: "/workspace/with-python",
        pathSeparator: "/",
        ignorePatterns: [],
      },
      status: 200,
      hasResponse: true,
    });
    vi.mocked(route_get_folder_contents).mockResolvedValue({
      data: [
        {
          name: "pyproject.toml",
          type: "file",
          fullPath: "/workspace/with-python/pyproject.toml",
        },
      ],
      status: 200,
      hasResponse: true,
    });

    renderProjectChatEmptyState({ onStarterPrompt });

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      getCreateProjectButton().dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onStarterPrompt).toHaveBeenCalledWith(
      buildCreateProjectStarterPrompt(true),
    );
  });
});
