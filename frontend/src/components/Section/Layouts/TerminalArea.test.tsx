import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalArea } from "./TerminalArea";

type MockProjectState = {
  projectConfig: {
    isEditingViewMode: boolean;
  };
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    isEditingViewMode: true,
  },
};

vi.mock("state/actions/sectionDisplayQueries", () => ({
  getActiveViewModeConfig: () => ({
    isUserFacing: false,
  }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getAttachedTerminalParentIdForTerminalSection: () => null,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: MockProjectState) => unknown,
    _equalityFn?: unknown,
  ) => selector(mockProjectState),
}));

vi.mock("state/hooks/terminals/terminal", () => ({
  useTerminal: () => ({ current: null }),
}));

describe("TerminalArea", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        isEditingViewMode: true,
      },
    };
  });

  it("adds horizontal inset when rendered inside standalone window chrome", () => {
    const markup = renderToStaticMarkup(
      <TerminalArea sectionId="terminal-1" host="standalone_page" />,
    );

    expect(markup).toContain('data-terminal-window-host-inset="true"');
    expect(markup).toContain('data-section-main-editor="true"');
    expect(markup).toContain("px-2");
  });

  it("keeps the terminal full-bleed in canvas layouts", () => {
    const markup = renderToStaticMarkup(
      <TerminalArea sectionId="terminal-1" />,
    );

    expect(markup).not.toContain('data-terminal-window-host-inset="true"');
  });
});
