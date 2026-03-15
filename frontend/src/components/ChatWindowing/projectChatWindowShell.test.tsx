import { getWindowControlQuickInfoText } from "components/Utils/windowControlQuickInfo";
import type {
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
  SetStateAction,
} from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatWindowShell } from "./projectChatWindowShell";

type MockProjectChatWindowSurfaceAction = {
  key: string;
  label: string;
  testId: string;
  instanceId: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
};

type MockProjectChatWindowSurfaceProps = {
  title: string;
  mode: ChatWindowMode;
  instanceId: string;
  actions: Array<MockProjectChatWindowSurfaceAction>;
  allowLayoutMutations?: boolean;
  roundedClassName: string;
  headerClassName?: string;
  dragHandleTestId?: string;
  onTitleClick: () => void;
  onTitleCommit?: (nextTitle: string) => void;
  onTitlePointerDown?: () => void;
  onTitlePointerMove?: () => void;
  onTitlePointerUp?: () => void;
  children: ReactNode;
};

type MockSectionWindowSurfaceProps = {
  sectionId: string;
  headerActions: ReactNode;
  roundedClassName: string;
  chatHost: ChatWindowPlacement | "standalone_page";
  chatModeOverride?: ChatWindowMode;
  headerProps?: Omit<ComponentPropsWithoutRef<"header">, "children" | "ref">;
};

type MockUnifiedChatSurfaceProps = {
  mode: ChatWindowMode;
  host: ChatWindowPlacement;
  surfaceId: string;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
};

type MockGitGraphWindowContentProps = {
  instanceId: string;
  showEmbeddedGitPaneToggle: boolean;
};

let lastProjectChatWindowSurfaceProps: MockProjectChatWindowSurfaceProps | null =
  null;
let lastSectionWindowSurfaceProps: MockSectionWindowSurfaceProps | null = null;
let lastUnifiedChatSurfaceProps: MockUnifiedChatSurfaceProps | null = null;
let lastGitGraphWindowContentProps: MockGitGraphWindowContentProps | null =
  null;

vi.mock("./ProjectChatWindowSurface", () => ({
  SECTION_WINDOW_ACTION_BUTTON_CLASS: "section-window-action",
  ProjectChatWindowSurface: (props: MockProjectChatWindowSurfaceProps) => {
    lastProjectChatWindowSurfaceProps = props;
    return (
      <div data-testid="mock-project-chat-window-surface">{props.children}</div>
    );
  },
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: (props: MockSectionWindowSurfaceProps) => {
    lastSectionWindowSurfaceProps = props;
    return <div data-testid="mock-section-window-surface" />;
  },
}));

vi.mock("./UnifiedChatSurface", () => ({
  UnifiedChatSurface: (props: MockUnifiedChatSurfaceProps) => {
    lastUnifiedChatSurfaceProps = props;
    return <div data-testid="mock-unified-chat-surface" />;
  },
}));

vi.mock("components/Git/GitGraphWindowContent", () => ({
  GitGraphWindowContent: (props: MockGitGraphWindowContentProps) => {
    lastGitGraphWindowContentProps = props;
    return <div data-testid="mock-git-graph-window-content" />;
  },
}));

type ProjectChatWindowShellProps = ComponentPropsWithoutRef<
  typeof ProjectChatWindowShell
>;

type RenderShellOverrides = Omit<
  Partial<ProjectChatWindowShellProps>,
  "window"
> & {
  window?: Partial<ProjectChatWindowShellProps["window"]>;
};

describe("ProjectChatWindowShell", () => {
  beforeEach(() => {
    lastProjectChatWindowSurfaceProps = null;
    lastSectionWindowSurfaceProps = null;
    lastUnifiedChatSurfaceProps = null;
    lastGitGraphWindowContentProps = null;
  });

  it("adapts project window actions into the shared surface and preserves chat ownership", () => {
    const handleMaximize = vi.fn();
    const onSetProjectChatId = vi.fn();

    renderShell({
      host: ChatWindowPlacementEnum.bottom_docked,
      headerClassName: "cursor-move",
      dragHandleTestId: "project-chat-floating-window-drag-handle",
      actionSpecs: [
        {
          key: "maximize",
          quickInfoAction: "maximize_window",
          title: "Review",
          testId: "project-chat-window-maximize",
          instanceId: "window-1",
          icon: <span>max</span>,
          onClick: handleMaximize,
        },
      ],
      onSetProjectChatId,
    });

    // The shell should convert quick-info-backed action specs into the existing project window header contract.
    expect(lastProjectChatWindowSurfaceProps?.title).toBe("Review");
    expect(lastProjectChatWindowSurfaceProps?.headerClassName).toBe(
      "cursor-move",
    );
    expect(lastProjectChatWindowSurfaceProps?.dragHandleTestId).toBe(
      "project-chat-floating-window-drag-handle",
    );
    expect(lastProjectChatWindowSurfaceProps?.actions).toHaveLength(1);
    expect(lastProjectChatWindowSurfaceProps?.actions[0]).toMatchObject({
      key: "maximize",
      testId: "project-chat-window-maximize",
      instanceId: "window-1",
      label: getWindowControlQuickInfoText({
        action: "maximize_window",
        title: "Review",
      }),
    });

    lastProjectChatWindowSurfaceProps?.actions[0]?.onClick();
    expect(handleMaximize).toHaveBeenCalledTimes(1);

    // Workspace project chat windows must keep their existing surface id and controlled chat id behavior.
    expect(lastUnifiedChatSurfaceProps).toMatchObject({
      mode: ChatWindowModeEnum.project_ai_mode,
      host: ChatWindowPlacementEnum.bottom_docked,
      surfaceId: "workspace:project-1:window-1",
      projectChatId: "thread-1",
    });

    lastUnifiedChatSurfaceProps?.setProjectChatId?.(
      (current) => `${current ?? "missing"}-next`,
    );
    expect(onSetProjectChatId).toHaveBeenCalledWith(
      "window-1",
      "thread-1-next",
    );
  });

  it("routes git graph windows through the git graph body instead of the unified chat surface", () => {
    renderShell({
      window: {
        mode: ChatWindowModeEnum.git_graph_mode,
        chatId: null,
      },
      showEmbeddedGitPaneToggle: false,
    });

    // Git graph windows keep the shared outer shell, but their body stays on the git graph surface.
    expect(lastProjectChatWindowSurfaceProps?.mode).toBe(
      ChatWindowModeEnum.git_graph_mode,
    );
    expect(lastGitGraphWindowContentProps).toEqual({
      instanceId: "window-1",
      showEmbeddedGitPaneToggle: false,
    });
    expect(lastUnifiedChatSurfaceProps).toBeNull();
  });

  it("renders section windows through SectionWindowSurface with adapted header actions", () => {
    const handleDock = vi.fn();
    const handleClose = vi.fn();
    const headerProps = {
      "data-testid": "project-chat-floating-window-drag-handle",
      className: "cursor-move",
    } satisfies Omit<ComponentPropsWithoutRef<"header">, "children" | "ref">;

    renderShell({
      window: {
        sectionId: "section-123",
      },
      actionSpecs: [
        {
          key: "dock",
          quickInfoAction: "dock_window",
          title: "Review",
          testId: "project-chat-window-dock",
          instanceId: "window-1",
          icon: <span>dock</span>,
          onClick: handleDock,
        },
        {
          key: "close",
          quickInfoAction: "close_window",
          title: "Review",
          testId: "project-chat-window-close",
          instanceId: "window-1",
          icon: <span>close</span>,
          className: "danger-action",
          onClick: handleClose,
        },
      ],
      sectionHeaderProps: headerProps,
    });

    // Section-owned windows should keep using the section surface while receiving the same dock or floating actions.
    expect(lastSectionWindowSurfaceProps).toMatchObject({
      sectionId: "section-123",
      roundedClassName: "rounded-xl",
      chatHost: ChatWindowPlacementEnum.floating,
      chatModeOverride: ChatWindowModeEnum.project_ai_mode,
      headerProps,
    });

    const headerButtons = resolveHeaderActionButtons(
      lastSectionWindowSurfaceProps?.headerActions ?? null,
    );
    expect(headerButtons).toHaveLength(2);
    expect(headerButtons[0]?.props["aria-label"]).toBe(
      getWindowControlQuickInfoText({
        action: "dock_window",
        title: "Review",
      }),
    );
    expect(headerButtons[0]?.props["data-testid"]).toBe(
      "project-chat-window-dock",
    );
    expect(headerButtons[0]?.props["data-chat-window-instance-id"]).toBe(
      "window-1",
    );
    expect(headerButtons[0]?.props.onClick).toBe(handleDock);
    expect(headerButtons[1]?.props.className).toBe("danger-action");
    expect(headerButtons[1]?.props.onClick).toBe(handleClose);
  });

  it("suppresses section header actions when layout mutations are hidden", () => {
    renderShell({
      window: {
        sectionId: "section-123",
      },
      showSectionWindowActions: false,
      actionSpecs: [
        {
          key: "close",
          quickInfoAction: "close_window",
          title: "Review",
          testId: "project-chat-window-close",
          instanceId: "window-1",
          icon: <span>close</span>,
          onClick: vi.fn(),
        },
      ],
    });

    // Read-only section windows should still render, but without header action buttons.
    expect(lastSectionWindowSurfaceProps?.headerActions).toBeNull();
    expect(lastProjectChatWindowSurfaceProps).toBeNull();
    expect(lastUnifiedChatSurfaceProps).toBeNull();
  });
});

function renderShell(overrides: RenderShellOverrides = {}) {
  const props: ProjectChatWindowShellProps = {
    window: {
      instanceId: "window-1",
      title: "Review",
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionId: null,
      chatId: "thread-1",
      ...overrides.window,
    },
    projectConfigId: overrides.projectConfigId ?? "project-1",
    host: overrides.host ?? ChatWindowPlacementEnum.floating,
    allowLayoutMutations: overrides.allowLayoutMutations ?? true,
    roundedClassName: overrides.roundedClassName ?? "rounded-xl",
    actionSpecs: overrides.actionSpecs ?? [],
    onTitleClick: overrides.onTitleClick ?? vi.fn(),
    onTitleCommit: overrides.onTitleCommit,
    headerClassName: overrides.headerClassName,
    dragHandleTestId: overrides.dragHandleTestId,
    onTitlePointerDown: overrides.onTitlePointerDown,
    onTitlePointerMove: overrides.onTitlePointerMove,
    onTitlePointerUp: overrides.onTitlePointerUp,
    showEmbeddedGitPaneToggle: overrides.showEmbeddedGitPaneToggle,
    showSectionWindowActions: overrides.showSectionWindowActions,
    sectionHeaderProps: overrides.sectionHeaderProps,
    onSetProjectChatId: overrides.onSetProjectChatId ?? vi.fn(),
  };

  renderToStaticMarkup(<ProjectChatWindowShell {...props} />);
}

function resolveHeaderActionButtons(
  headerActions: ReactNode,
): Array<ReactElement<ComponentPropsWithoutRef<"button">>> {
  if (!isValidElement<{ children?: ReactNode }>(headerActions)) {
    return [];
  }

  return Children.toArray(headerActions.props.children).flatMap((child) => {
    if (!isValidElement<ComponentPropsWithoutRef<"button">>(child)) {
      return [];
    }
    return [child];
  });
}
