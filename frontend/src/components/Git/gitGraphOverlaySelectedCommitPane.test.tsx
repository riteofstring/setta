/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useGitStore } from "state/git";
import "testUtils/reactRefreshPreamble";
import {
  createGetGitCommitDetailsResponse,
  createGitCommit,
} from "utils/generatedTypes";
import { createEmptyGitGraphRowComputationState } from "utils/gitGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GitGraphOverlaySelectedCommitDetails,
  GitGraphOverlaySelectedCommitPane,
} from "./gitGraphOverlaySelectedCommitPane";

const selectGitCommit = vi.fn();
const selectGitCommitFile = vi.fn();

vi.mock("components/Git/GitDiffCodeMirror", () => ({
  GitDiffCodeMirror: ({
    value,
    filePathForLanguage,
  }: {
    value: string;
    filePathForLanguage?: string | null;
  }) => (
    <div
      data-testid="mock-git-diff-code-mirror"
      data-file-path={filePathForLanguage ?? ""}
    >
      {value}
    </div>
  ),
}));

vi.mock("state/actions/gitGraphSelection", () => ({
  selectGitCommit: (hash: string) => selectGitCommit(hash),
  selectGitCommitFile: (selection: { path: string; oldPath: string | null }) =>
    selectGitCommitFile(selection),
}));

function setGraphSelectionState({
  selectedCommitHash,
  selectedCommitDetails,
  selectedCommitDetailsIsLoading = false,
  selectedCommitDetailsError = null,
  selectedCommitFilePath = null,
}: {
  selectedCommitHash: string | null;
  selectedCommitDetails: ReturnType<
    typeof createGetGitCommitDetailsResponse
  > | null;
  selectedCommitDetailsIsLoading?: boolean;
  selectedCommitDetailsError?: string | null;
  selectedCommitFilePath?: string | null;
}): void {
  useGitStore.setState({
    status: {
      response: null,
      diffAvailabilityByPath: new Map(),
      isLoading: false,
      error: null,
    },
    overlay: { kind: "none" },
    graph: {
      projectConfigId: "project-1",
      allRefs: false,
      response: null,
      seenCommitHashes: new Set<string>(),
      rows: [],
      rowComputationState: createEmptyGitGraphRowComputationState(),
      filterText: "",
      isLoading: false,
      isLoadingMore: false,
      error: null,
      loadMoreError: null,
      hasMore: false,
      nextOffset: null,
      pageSize: 250,
      isCapped: false,
      selectedCommitHash,
      selectedCommitDetails,
      selectedCommitDetailsIsLoading,
      selectedCommitDetailsError,
      selectedCommitFilePath,
      selectedCommitFileDiffResponse: null,
      selectedCommitFileDiffIsLoading: false,
      selectedCommitFileDiffError: null,
    },
  });
}

function findButtonByText(
  host: HTMLElement,
  text: RegExp,
): HTMLButtonElement | null {
  return (Array.from(host.querySelectorAll("button")).find((button) =>
    text.test(button.textContent ?? ""),
  ) ?? null) as HTMLButtonElement | null;
}

describe("GitGraphOverlay selected commit surfaces", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    useGitStore.getState().reset();
    selectGitCommit.mockReset();
    selectGitCommitFile.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useGitStore.getState().reset();
  });

  it("keeps reload, file selection, and diff rendering in the selected-commit surface owner", async () => {
    // Verifies the extracted owner still wires the right-side header and the
    // expanded file list to the same git selection commands.
    const selectedCommit = createGitCommit({
      hash: "abc12345def67890",
      parents: ["01234567"],
      authorName: "Dana",
      authorEmail: "dana@example.com",
      authorTimeMs: 1,
      subject: "Refactor git graph selected commit surface",
      decorations: ["HEAD -> main"],
    });
    setGraphSelectionState({
      selectedCommitHash: selectedCommit.hash,
      selectedCommitDetails: createGetGitCommitDetailsResponse({
        repoRoot: "/repo",
        commitHash: selectedCommit.hash,
        parents: ["01234567"],
        authorName: "Dana",
        authorEmail: "dana@example.com",
        authorTimeMs: 1,
        committerName: "Dana",
        committerEmail: "dana@example.com",
        committerTimeMs: 1,
        subject: selectedCommit.subject,
        body: "details body",
        isTruncated: false,
        files: [
          {
            path: "frontend/src/components/Git/GitGraphOverlay.tsx",
            oldPath: null,
            status: "M",
            additions: 10,
            deletions: 4,
          },
        ],
      }),
      selectedCommitFilePath: "frontend/src/components/Git/GitGraphOverlay.tsx",
    });

    await act(async () => {
      root.render(
        <>
          <GitGraphOverlaySelectedCommitPane
            selectedCommit={selectedCommit}
            selectedCommitFilePath="frontend/src/components/Git/GitGraphOverlay.tsx"
            selectedCommitFileDiffResponse={{
              repoRoot: "/repo",
              commitHash: selectedCommit.hash,
              path: "frontend/src/components/Git/GitGraphOverlay.tsx",
              diff: "diff --git a/file b/file",
              isTruncated: false,
            }}
            selectedCommitFileDiffIsLoading={false}
            selectedCommitFileDiffError={null}
            selectedCommitDetailsTruncated={false}
          />
          <GitGraphOverlaySelectedCommitDetails
            commitHash={selectedCommit.hash}
          />
        </>,
      );
    });

    const reloadButton = findButtonByText(host, /^Reload$/);
    expect(reloadButton).not.toBeNull();
    await act(async () => {
      reloadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selectGitCommit).toHaveBeenCalledWith(selectedCommit.hash);

    const fileButton = findButtonByText(host, /GitGraphOverlay\.tsx/);
    expect(fileButton).not.toBeNull();
    await act(async () => {
      fileButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selectGitCommitFile).toHaveBeenCalledWith({
      path: "frontend/src/components/Git/GitGraphOverlay.tsx",
      oldPath: null,
    });

    const diff = host.querySelector(
      '[data-testid="mock-git-diff-code-mirror"]',
    ) as HTMLElement | null;
    expect(diff?.textContent).toContain("diff --git a/file b/file");
    expect(diff?.getAttribute("data-file-path")).toBe(
      "frontend/src/components/Git/GitGraphOverlay.tsx",
    );
  });

  it("shows the default prompts when no commit is selected", async () => {
    // Verifies the extracted pane keeps the original empty-state copy intact.
    await act(async () => {
      root.render(
        <GitGraphOverlaySelectedCommitPane
          selectedCommit={null}
          selectedCommitFilePath={null}
          selectedCommitFileDiffResponse={null}
          selectedCommitFileDiffIsLoading={false}
          selectedCommitFileDiffError={null}
          selectedCommitDetailsTruncated={false}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Select a commit to view details.");
  });

  it("renders loading and error states from the selected-commit details owner", async () => {
    // Verifies the extracted details owner still mirrors store-backed fetch
    // progress and failure states without help from the root overlay.
    await act(async () => {
      setGraphSelectionState({
        selectedCommitHash: "abc12345",
        selectedCommitDetails: null,
        selectedCommitDetailsIsLoading: true,
      });
      root.render(
        <GitGraphOverlaySelectedCommitDetails commitHash="abc12345" />,
      );
    });
    expect(host.textContent).toContain("Loading commit details…");

    await act(async () => {
      setGraphSelectionState({
        selectedCommitHash: "abc12345",
        selectedCommitDetails: null,
        selectedCommitDetailsError: "details failed",
      });
      root.render(
        <GitGraphOverlaySelectedCommitDetails commitHash="abc12345" />,
      );
    });
    expect(host.textContent).toContain("details failed");
  });
});
