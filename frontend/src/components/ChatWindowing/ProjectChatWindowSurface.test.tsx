/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { ChatWindowModeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatWindowSurface } from "./ProjectChatWindowSurface";

vi.mock("components/ChatWindowing/ProjectChatWindowIcon", () => ({
  ProjectChatWindowIcon: () => (
    <span data-testid="mock-project-chat-window-icon" />
  ),
}));

vi.mock("components/Section/Container/sectionChrome", () => ({
  getSectionContainerShellClassName: () => "mock-section-container-shell",
  getSectionSurfaceClassName: () => "mock-section-surface",
}));

vi.mock("components/Section/Container/utils", () => ({
  getBgColor: () => "bg-setta-50",
}));

vi.mock("components/Section/Header/SectionHeader", () => ({
  getTitleStyles: () => ({
    editing: "mock-title-editing",
    notEditing: "mock-title-not-editing",
  }),
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    _selector: (state: { sections: Record<string, unknown> }) => unknown,
  ) => null,
}));

describe("ProjectChatWindowSurface", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("hides layout actions and title editing when layout mutations are disabled", async () => {
    const onTitleCommit = vi.fn();

    await act(async () => {
      root.render(
        <ProjectChatWindowSurface
          title="Read Only Chat"
          mode={ChatWindowModeEnum.project_ai_mode}
          instanceId="window-1"
          allowLayoutMutations={false}
          actions={[
            {
              key: "maximize",
              label: "Maximize Read Only Chat",
              testId: "project-chat-window-maximize",
              instanceId: "window-1",
              icon: <span>+</span>,
              onClick: vi.fn(),
            },
          ]}
          onTitleClick={() => {}}
          onTitleCommit={onTitleCommit}
          headerClassName="cursor-move"
          dragHandleTestId="project-chat-floating-window-drag-handle"
          roundedClassName="rounded-none"
        >
          <div>body</div>
        </ProjectChatWindowSurface>,
      );
    });

    const title = host.querySelector(
      '[data-testid="project-chat-window-title"]',
    ) as HTMLElement | null;
    expect(title).not.toBeNull();
    expect(
      host.querySelector('[data-testid="project-chat-window-maximize"]'),
    ).toBeNull();
    expect(
      host.querySelector(
        '[data-testid="project-chat-floating-window-drag-handle"]',
      ),
    ).toBeNull();

    await act(async () => {
      title?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(
      host.querySelector('[data-testid="project-chat-window-title-input"]'),
    ).toBeNull();
    expect(onTitleCommit).not.toHaveBeenCalled();
  });

  it("still allows title editing when layout mutations are enabled", async () => {
    await act(async () => {
      root.render(
        <ProjectChatWindowSurface
          title="Editable Chat"
          mode={ChatWindowModeEnum.project_ai_mode}
          instanceId="window-2"
          allowLayoutMutations
          actions={[]}
          onTitleClick={() => {}}
          onTitleCommit={() => {}}
          roundedClassName="rounded-none"
        >
          <div>body</div>
        </ProjectChatWindowSurface>,
      );
    });

    const title = host.querySelector(
      '[data-testid="project-chat-window-title"]',
    ) as HTMLElement | null;

    await act(async () => {
      title?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(
      host.querySelector('[data-testid="project-chat-window-title-input"]'),
    ).not.toBeNull();
  });
});
