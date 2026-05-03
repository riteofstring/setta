import {
  ProjectChatWindowSurface,
  SECTION_WINDOW_ACTION_BUTTON_CLASS,
  SECTION_WINDOW_CLOSE_BUTTON_CLASS,
  SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
} from "components/ChatWindowing/ProjectChatWindowSurface";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import { type PointerEvent, type ReactNode } from "react";
import {
  MdChevronLeft,
  MdChevronRight,
  MdFlipToFront,
  MdOpenInNew,
} from "react-icons/md";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";

import {
  DOCKED_CHAT_WINDOW_SHADOW_CLASS,
  DOCKED_WINDOWED_CHAT_ROUNDED_CLASS,
  DOCK_SURFACE_MAX_WIDTH_PX,
  DOCK_WINDOW_DEFAULT_HEIGHT_PX,
  DOCK_WINDOW_DEFAULT_WIDTH_PX,
  MIN_DOCK_CHAT_HEIGHT_PX,
  MIN_DOCK_CHAT_WIDTH_PX,
  ResolvedWindowPill,
  WINDOW_MAXIMIZE_ICON,
  WindowResizeDirection,
  canMoveProjectChatWindowToCanvas,
  getChatWindowEnterAnimationClass,
  getChatWindowExitAnimationClass,
  type ChatWindowEnterAnimationKind,
  type ChatWindowExitAnimationKind,
} from "./shared";
import {
  DockedWindowResizeHandles,
  ProjectChatWindowContent,
} from "./windowContent";

type DockedWindowPanelProps = {
  pill: ResolvedWindowPill;
  projectConfigId: string;
  canEditLayout: boolean;
  dockAvailableHeightPx: number;
  resolvedWindowWidthPx: number;
  resolvedWindowHeightPx: number;
  dockedExitAnimation: ChatWindowExitAnimationKind | null;
  dockedEnterAnimation: ChatWindowEnterAnimationKind | null;
  dockedEnterAnimationPrime: ChatWindowEnterAnimationKind | null;
  showDockHeaderCycleControls: boolean;
  canCycleDockBackward: boolean;
  canCycleDockForward: boolean;
  onCycleDockBackward: () => void;
  onCycleDockForward: () => void;
  onFocusWindow: (instanceId: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onUndockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onSingleDockResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: WindowResizeDirection,
  ) => void;
  onSingleDockResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onSingleDockResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

type DockedWindowActionDefinition = {
  key: string;
  testId: string;
  instanceId: string;
  icon: ReactNode;
  onClick: () => void;
  quickInfo: Parameters<typeof getWindowControlQuickInfoText>[0];
  className?: string;
  disabled?: boolean;
};

function mapDockedWindowActionToSurfaceAction(
  action: DockedWindowActionDefinition,
) {
  return {
    key: action.key,
    label: getWindowControlQuickInfoText(action.quickInfo),
    testId: action.testId,
    instanceId: action.instanceId,
    icon: action.icon,
    onClick: action.onClick,
    ...(action.className === undefined ? {} : { className: action.className }),
    ...(action.disabled === undefined ? {} : { disabled: action.disabled }),
  };
}

function renderDockedWindowHeaderAction(
  action: DockedWindowActionDefinition,
): ReactNode {
  const label = getWindowControlQuickInfoText(action.quickInfo);
  return (
    <button
      key={`${action.instanceId}-${action.key}`}
      type="button"
      className={action.className ?? SECTION_WINDOW_ACTION_BUTTON_CLASS}
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={label}
      data-testid={action.testId}
      data-chat-window-instance-id={action.instanceId}
      {...getWindowControlQuickInfoHandlers(action.quickInfo)}
    >
      {action.icon}
    </button>
  );
}

function buildDockedWindowActions({
  instanceId,
  title,
  showDockHeaderCycleControls,
  canCycleDockBackward,
  canCycleDockForward,
  canShowCanvasAction,
  onCycleDockBackward,
  onCycleDockForward,
  onShowInCanvas,
  onUndockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
}: {
  instanceId: string;
  title: string;
  showDockHeaderCycleControls: boolean;
  canCycleDockBackward: boolean;
  canCycleDockForward: boolean;
  canShowCanvasAction: boolean;
  onCycleDockBackward: () => void;
  onCycleDockForward: () => void;
  onShowInCanvas: (instanceId: string) => void;
  onUndockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
}): DockedWindowActionDefinition[] {
  const actions: DockedWindowActionDefinition[] = [];

  if (showDockHeaderCycleControls) {
    actions.push(
      {
        key: "cycle_left",
        testId: "project-chat-window-cycle-left",
        instanceId,
        icon: <MdChevronLeft size={12} />,
        onClick: onCycleDockBackward,
        quickInfo: { action: "show_previous_docked_chat" },
        className: `${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`,
        disabled: !canCycleDockBackward,
      },
      {
        key: "cycle_right",
        testId: "project-chat-window-cycle-right",
        instanceId,
        icon: <MdChevronRight size={12} />,
        onClick: onCycleDockForward,
        quickInfo: { action: "show_next_docked_chat" },
        className: `${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`,
        disabled: !canCycleDockForward,
      },
    );
  }

  if (canShowCanvasAction) {
    actions.push({
      key: "show_in_canvas",
      testId: "project-chat-window-show-in-canvas",
      instanceId,
      icon: <MdFlipToFront size={12} />,
      onClick: () => {
        onShowInCanvas(instanceId);
      },
      quickInfo: { action: "show_in_canvas", title },
    });
  }

  actions.push(
    {
      key: "undock",
      testId: "project-chat-window-undock",
      instanceId,
      icon: <MdOpenInNew size={12} />,
      onClick: () => {
        onUndockWindow(instanceId);
      },
      quickInfo: { action: "undock_window", title },
    },
    {
      key: "maximize",
      testId: "project-chat-window-maximize",
      instanceId,
      icon: WINDOW_MAXIMIZE_ICON,
      onClick: () => {
        onMaximizeWindow(instanceId);
      },
      quickInfo: { action: "maximize_window", title },
    },
    {
      key: "minimize",
      testId: "project-chat-window-minimize",
      instanceId,
      icon: <i className="gg-math-minus" />,
      onClick: () => {
        onMinimizeWindow(instanceId);
      },
      quickInfo: { action: "minimize_window", title },
      className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
    },
    {
      key: "close",
      testId: "project-chat-window-close",
      instanceId,
      icon: <i className="gg-close" />,
      onClick: () => {
        onCloseWindow(instanceId);
      },
      quickInfo: { action: "close_window", title },
      className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
    },
  );

  return actions;
}

function DockedWindowPanel({
  pill,
  projectConfigId,
  canEditLayout,
  dockAvailableHeightPx,
  resolvedWindowWidthPx,
  resolvedWindowHeightPx,
  dockedExitAnimation,
  dockedEnterAnimation,
  dockedEnterAnimationPrime,
  showDockHeaderCycleControls,
  canCycleDockBackward,
  canCycleDockForward,
  onCycleDockBackward,
  onCycleDockForward,
  onFocusWindow,
  onShowInCanvas,
  onUndockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
  onSingleDockResizePointerDown,
  onSingleDockResizePointerMove,
  onSingleDockResizePointerUp,
}: DockedWindowPanelProps) {
  const canShowCanvasAction = canMoveProjectChatWindowToCanvas(pill.mode);
  const focusWindow = () => {
    onFocusWindow(pill.instanceId);
  };
  const titleCommit =
    pill.mode === ChatWindowModeEnum.git_graph_mode
      ? undefined
      : (nextTitle: string) => {
          onSetWindowTitle(pill.instanceId, nextTitle);
        };
  const dockedWindowActions = buildDockedWindowActions({
    instanceId: pill.instanceId,
    title: pill.title,
    showDockHeaderCycleControls,
    canCycleDockBackward,
    canCycleDockForward,
    canShowCanvasAction,
    onCycleDockBackward,
    onCycleDockForward,
    onShowInCanvas,
    onUndockWindow,
    onMaximizeWindow,
    onMinimizeWindow,
    onCloseWindow,
  });

  return (
    <article
      key={pill.instanceId}
      className={`pointer-events-auto relative flex min-h-0 min-w-[16rem] shrink-0 flex-col overflow-hidden bg-transparent ${DOCKED_CHAT_WINDOW_SHADOW_CLASS} ${getChatWindowExitAnimationClass(
        dockedExitAnimation,
        ChatWindowPlacementEnum.bottom_docked,
      )} ${getChatWindowEnterAnimationClass(
        dockedEnterAnimationPrime,
        ChatWindowPlacementEnum.bottom_docked,
      )}`}
      style={{
        width: resolvedWindowWidthPx,
        height: resolvedWindowHeightPx,
        minWidth: MIN_DOCK_CHAT_WIDTH_PX,
        maxWidth: DOCK_SURFACE_MAX_WIDTH_PX,
        minHeight: MIN_DOCK_CHAT_HEIGHT_PX,
        maxHeight: dockAvailableHeightPx,
      }}
      data-testid="project-chat-bottom-dock-window-panel"
      data-chat-window-instance-id={pill.instanceId}
      data-chat-window-exit-animation={dockedExitAnimation ?? undefined}
      data-chat-window-enter-animation={dockedEnterAnimation ?? undefined}
      onPointerDown={focusWindow}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {pill.sectionId ? (
          <SectionWindowSurface
            sectionId={pill.sectionId}
            roundedClassName={DOCKED_WINDOWED_CHAT_ROUNDED_CLASS}
            chatHost={ChatWindowPlacementEnum.bottom_docked}
            chatModeOverride={pill.mode}
            headerActions={dockedWindowActions.map(
              renderDockedWindowHeaderAction,
            )}
          />
        ) : (
          <ProjectChatWindowSurface
            title={pill.title}
            mode={pill.mode}
            instanceId={pill.instanceId}
            allowLayoutMutations={canEditLayout}
            roundedClassName={DOCKED_WINDOWED_CHAT_ROUNDED_CLASS}
            onTitleClick={focusWindow}
            {...(titleCommit ? { onTitleCommit: titleCommit } : {})}
            actions={dockedWindowActions.map(
              mapDockedWindowActionToSurfaceAction,
            )}
          >
            <ProjectChatWindowContent
              pill={pill}
              projectConfigId={projectConfigId}
              host={ChatWindowPlacementEnum.bottom_docked}
            />
          </ProjectChatWindowSurface>
        )}
        {canEditLayout ? (
          <DockedWindowResizeHandles
            pill={pill}
            onPointerDown={onSingleDockResizePointerDown}
            onPointerMove={onSingleDockResizePointerMove}
            onPointerUp={onSingleDockResizePointerUp}
          />
        ) : null}
      </div>
    </article>
  );
}

type DockedChatSurfaceLayerProps = {
  visibleDockedPills: ResolvedWindowPill[];
  projectConfigId: string;
  canEditLayout: boolean;
  dockAvailableHeightPx: number;
  dockSurfaceWidthCss: string;
  dockSurfaceHeightCss: string;
  resolvedVisibleDockWindowWidthsById: Record<string, number>;
  resolvedDockWindowHeightsById: Record<string, number>;
  windowExitAnimationsById: Record<string, ChatWindowExitAnimationKind>;
  windowEnterAnimationsById: Record<string, ChatWindowEnterAnimationKind>;
  windowEnterAnimationPrimesById: Record<string, ChatWindowEnterAnimationKind>;
  showDockHeaderCycleControls: boolean;
  canCycleDockBackward: boolean;
  canCycleDockForward: boolean;
  onCycleDockBackward: () => void;
  onCycleDockForward: () => void;
  onFocusWindow: (instanceId: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onUndockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onSingleDockResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: WindowResizeDirection,
  ) => void;
  onSingleDockResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onSingleDockResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export function DockedChatSurfaceLayer({
  visibleDockedPills,
  projectConfigId,
  canEditLayout,
  dockAvailableHeightPx,
  dockSurfaceWidthCss,
  dockSurfaceHeightCss,
  resolvedVisibleDockWindowWidthsById,
  resolvedDockWindowHeightsById,
  windowExitAnimationsById,
  windowEnterAnimationsById,
  windowEnterAnimationPrimesById,
  showDockHeaderCycleControls,
  canCycleDockBackward,
  canCycleDockForward,
  onCycleDockBackward,
  onCycleDockForward,
  onFocusWindow,
  onShowInCanvas,
  onUndockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
  onSingleDockResizePointerDown,
  onSingleDockResizePointerMove,
  onSingleDockResizePointerUp,
}: DockedChatSurfaceLayerProps) {
  return (
    <section
      className="pointer-events-none"
      style={{
        width: dockSurfaceWidthCss,
        height: dockSurfaceHeightCss,
      }}
      data-testid="project-chat-bottom-dock-window"
    >
      <div
        className="flex h-full min-h-0 items-end justify-end gap-3 overflow-x-hidden overflow-y-hidden px-1"
        data-testid="project-chat-bottom-dock-window-grid"
      >
        {visibleDockedPills.map((pill) => (
          <DockedWindowPanel
            key={pill.instanceId}
            pill={pill}
            projectConfigId={projectConfigId}
            canEditLayout={canEditLayout}
            dockAvailableHeightPx={dockAvailableHeightPx}
            resolvedWindowWidthPx={
              resolvedVisibleDockWindowWidthsById[pill.instanceId] ??
              DOCK_WINDOW_DEFAULT_WIDTH_PX
            }
            resolvedWindowHeightPx={
              resolvedDockWindowHeightsById[pill.instanceId] ??
              DOCK_WINDOW_DEFAULT_HEIGHT_PX
            }
            dockedExitAnimation={
              windowExitAnimationsById[pill.instanceId] ?? null
            }
            dockedEnterAnimation={
              windowEnterAnimationsById[pill.instanceId] ?? null
            }
            dockedEnterAnimationPrime={
              windowEnterAnimationPrimesById[pill.instanceId] ?? null
            }
            showDockHeaderCycleControls={showDockHeaderCycleControls}
            canCycleDockBackward={canCycleDockBackward}
            canCycleDockForward={canCycleDockForward}
            onCycleDockBackward={onCycleDockBackward}
            onCycleDockForward={onCycleDockForward}
            onFocusWindow={onFocusWindow}
            onShowInCanvas={onShowInCanvas}
            onUndockWindow={onUndockWindow}
            onMaximizeWindow={onMaximizeWindow}
            onMinimizeWindow={onMinimizeWindow}
            onCloseWindow={onCloseWindow}
            onSetWindowTitle={onSetWindowTitle}
            onSingleDockResizePointerDown={onSingleDockResizePointerDown}
            onSingleDockResizePointerMove={onSingleDockResizePointerMove}
            onSingleDockResizePointerUp={onSingleDockResizePointerUp}
          />
        ))}
      </div>
    </section>
  );
}
