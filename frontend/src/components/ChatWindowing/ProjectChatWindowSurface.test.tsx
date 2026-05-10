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

  it("uses shared floating-box quick info for header action buttons", async () => {
    await act(async () => {
      root.render(
        <ProjectChatWindowSurface
          title="Tooltip Chat"
          mode={ChatWindowModeEnum.project_ai_mode}
          instanceId="window-3"
          allowLayoutMutations
          actions={[
            {
              key: "undock",
              label: "Undock Tooltip Chat",
              testId: "project-chat-window-undock",
              instanceId: "window-3",
              icon: <span>+</span>,
              onClick: vi.fn(),
            },
          ]}
          onTitleClick={() => {}}
          roundedClassName="rounded-none"
        >
          <div>body</div>
        </ProjectChatWindowSurface>,
      );
    });

    expect(
      host
        .querySelector('[data-testid="project-chat-window-undock"]')
        ?.getAttribute("data-tooltip-content"),
    ).toBe("Undock Tooltip Chat");
  });

  it("can reuse the shared chat frame without rendering the floating header", async () => {
    await act(async () => {
      root.render(
        <ProjectChatWindowSurface
          title="Headerless Chat"
          mode={ChatWindowModeEnum.project_ai_mode}
          instanceId="window-4"
          allowLayoutMutations={false}
          actions={[]}
          onTitleClick={() => {}}
          roundedClassName="rounded-none"
          showHeader={false}
        >
          <div data-testid="headerless-chat-body">body</div>
        </ProjectChatWindowSurface>,
      );
    });

    const frame = host.querySelector(
      '[data-testid="project-chat-window-surface"]',
    ) as HTMLElement | null;
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("data-chat-window-frame")).toBe("project-chat");
    expect(
      host.querySelector('[data-testid="project-chat-window-title"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="headerless-chat-body"]'),
    ).not.toBeNull();
  });
});
