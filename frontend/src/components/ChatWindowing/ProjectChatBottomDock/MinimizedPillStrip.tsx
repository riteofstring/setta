import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { collectStripItemLayoutAnimations } from "components/ChatWindowing/projectChatBottomDockInteractions";
import { type PillDisplayMode } from "components/ChatWindowing/projectChatBottomDockLayout";
import { ProjectChatWindowIcon } from "components/ChatWindowing/ProjectChatWindowIcon";
import { ProjectChatManager } from "components/Panes/Overview/ProjectLevelAI/ProjectChatManager";
import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MdAdd, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { RiChat3Line } from "react-icons/ri";

import {
  CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS,
  type ChatWindowPillExitAnimationKind,
  ResolvedWindowPill,
  buildPillBaseClass,
} from "./shared";

type MinimizedPillStripProps = {
  pills: ResolvedWindowPill[];
  visiblePills: ResolvedWindowPill[];
  pillExitAnimationsById: Record<string, ChatWindowPillExitAnimationKind>;
  useCompactPills: boolean;
  canCreateWindow: boolean;
  showManagerMenu: boolean;
  canCycleBackward: boolean;
  canCycleForward: boolean;
  maxCycleStartIndex: number;
  pillDisplayMode: PillDisplayMode;
  pillViewportRef: React.RefObject<HTMLDivElement | null>;
  fullMeasureRowRef: React.RefObject<HTMLDivElement | null>;
  compactMeasureRowRef: React.RefObject<HTMLDivElement | null>;
  onCycleBackward: () => void;
  onCycleForward: () => void;
  onOpenWindow: (instanceId: string, source: "pill" | "menu") => void;
  onCreateWindow: () => void;
};

export function MinimizedPillStrip({
  pills,
  visiblePills,
  pillExitAnimationsById,
  useCompactPills,
  canCreateWindow,
  showManagerMenu,
  canCycleBackward,
  canCycleForward,
  maxCycleStartIndex,
  pillDisplayMode,
  pillViewportRef,
  fullMeasureRowRef,
  compactMeasureRowRef,
  onCycleBackward,
  onCycleForward,
  onOpenWindow,
  onCreateWindow,
}: MinimizedPillStripProps) {
  const minimizedTabBaseClassName = `pointer-events-auto relative inline-flex h-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent text-xs shadow-sm transition-colors will-change-transform ${buildPillBaseClass(false)}`;
  const createTabClassName = `${minimizedTabBaseClassName} w-7`;
  const chatMenuTriggerClassName = `${minimizedTabBaseClassName} w-7`;
  const [isManagerMenuOpen, setIsManagerMenuOpen] = useState(false);
  const stripItemNodesRef = useRef<Record<string, HTMLElement>>({});
  const previousStripItemRectsRef = useRef<Record<string, DOMRect>>({});
  const stripItemAnimationTimeoutsRef = useRef<Record<string, number>>({});
  const stripItemAnimationFrameRef = useRef<number | null>(null);
  const hasStripMountedRef = useRef(false);

  const clearStripItemAnimation = useCallback((itemKey: string) => {
    const activeTimeoutId = stripItemAnimationTimeoutsRef.current[itemKey];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete stripItemAnimationTimeoutsRef.current[itemKey];
    }
    const node = stripItemNodesRef.current[itemKey];
    if (!node) {
      return;
    }
    delete node.dataset.chatPillLayoutAnimation;
    node.style.transition = "";
    node.style.transform = "";
  }, []);

  const setStripItemNode = useCallback(
    (itemKey: string) => (node: HTMLElement | null) => {
      if (node) {
        stripItemNodesRef.current[itemKey] = node;
        return;
      }
      delete stripItemNodesRef.current[itemKey];
      delete previousStripItemRectsRef.current[itemKey];
    },
    [],
  );

  const renderedStripItemKeys = useMemo(() => {
    const nextKeys: string[] = [];
    if (pillDisplayMode === "cycle") {
      nextKeys.push("cycle-left");
    }
    nextKeys.push("create");
    if (showManagerMenu) {
      nextKeys.push("manager");
    }
    if (pillDisplayMode !== "menu") {
      for (const pill of visiblePills) {
        nextKeys.push(`pill:${pill.instanceId}`);
      }
    }
    if (pillDisplayMode === "cycle") {
      nextKeys.push("cycle-right");
    }
    return nextKeys;
  }, [pillDisplayMode, showManagerMenu, visiblePills]);

  useEffect(() => {
    return () => {
      if (stripItemAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(stripItemAnimationFrameRef.current);
        stripItemAnimationFrameRef.current = null;
      }
      for (const timeoutId of Object.values(
        stripItemAnimationTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      stripItemAnimationTimeoutsRef.current = {};
    };
  }, []);

  useLayoutEffect(() => {
    const { nextRectsByItemKey, animations } = collectStripItemLayoutAnimations(
      {
        renderedStripItemKeys,
        nodesByItemKey: stripItemNodesRef.current,
        previousRectsByItemKey: previousStripItemRectsRef.current,
        hasMounted: hasStripMountedRef.current,
      },
    );
    previousStripItemRectsRef.current = nextRectsByItemKey;

    for (const animation of animations) {
      clearStripItemAnimation(animation.itemKey);
      animation.node.dataset.chatPillLayoutAnimation = "active";
      animation.node.style.transition = "none";
      animation.node.style.transform = animation.initialTransform;
    }

    if (!hasStripMountedRef.current) {
      hasStripMountedRef.current = true;
      return;
    }
    if (animations.length === 0) {
      return;
    }
    if (stripItemAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(stripItemAnimationFrameRef.current);
    }
    stripItemAnimationFrameRef.current = window.requestAnimationFrame(() => {
      stripItemAnimationFrameRef.current = null;
      for (const animation of animations) {
        const { itemKey, node, finalTransform } = animation;
        node.style.transition = `transform ${CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1)`;
        node.style.transform = finalTransform;
        const activeTimeoutId = stripItemAnimationTimeoutsRef.current[itemKey];
        if (activeTimeoutId !== undefined) {
          window.clearTimeout(activeTimeoutId);
        }
        stripItemAnimationTimeoutsRef.current[itemKey] = window.setTimeout(
          () => {
            delete stripItemAnimationTimeoutsRef.current[itemKey];
            if (stripItemNodesRef.current[itemKey] !== node) {
              return;
            }
            clearStripItemAnimation(itemKey);
          },
          CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS,
        );
      }
    });
  }, [clearStripItemAnimation, renderedStripItemKeys]);

  return (
    <div
      ref={pillViewportRef}
      className="relative ml-auto flex min-w-0 max-w-full items-end justify-end gap-1 px-2"
    >
      <div
        className="pointer-events-none absolute left-0 top-0 h-0 overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <div ref={fullMeasureRowRef} className="flex w-max items-center gap-1">
          <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
            <MdAdd size={14} />
          </div>
          {showManagerMenu ? (
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
              <RiChat3Line size={14} />
            </div>
          ) : null}
          {pills.map((pill) => (
            <div
              key={`measure-full-${pill.instanceId}`}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-b-none rounded-t-md border border-b-transparent bg-setta-100 px-2 text-xs"
            >
              <ProjectChatWindowIcon
                mode={pill.mode}
                instanceId={pill.instanceId}
                sectionId={pill.sectionId}
                className="inline-flex shrink-0 items-center justify-center text-setta-600 dark:text-setta-300"
              />
              <span className="max-w-[9.5rem] truncate">{pill.title}</span>
            </div>
          ))}
        </div>
        <div
          ref={compactMeasureRowRef}
          className="mt-1 flex w-max items-center gap-1"
        >
          <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
            <MdAdd size={14} />
          </div>
          {showManagerMenu ? (
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
              <RiChat3Line size={14} />
            </div>
          ) : null}
          {pills.map((pill) => (
            <div
              key={`measure-compact-${pill.instanceId}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100"
            >
              <ProjectChatWindowIcon
                mode={pill.mode}
                instanceId={pill.instanceId}
                sectionId={pill.sectionId}
                className="inline-flex items-center justify-center text-setta-600 dark:text-setta-300"
              />
            </div>
          ))}
        </div>
      </div>
      {pillDisplayMode === "cycle" ? (
        <button
          type="button"
          className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 bg-setta-50 text-setta-700 shadow-sm transition-colors enabled:hover:bg-setta-100 enabled:hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-setta-700 dark:bg-setta-860 dark:text-setta-200 dark:enabled:hover:bg-setta-800 dark:enabled:hover:text-setta-50"
          ref={setStripItemNode("cycle-left")}
          onClick={onCycleBackward}
          disabled={!canCycleBackward}
          aria-label={getWindowControlQuickInfoText({
            action: "show_previous_chat_windows",
          })}
          data-testid="project-chat-bottom-dock-cycle-left"
          {...getWindowControlQuickInfoHandlers({
            action: "show_previous_chat_windows",
          })}
        >
          <MdChevronLeft size={14} />
        </button>
      ) : null}
      <div className="flex min-w-0 items-end justify-end gap-1 overflow-hidden">
        {canCreateWindow ? (
          <button
            type="button"
            className={createTabClassName}
            ref={setStripItemNode("create")}
            onClick={onCreateWindow}
            aria-label={getWindowControlQuickInfoText({
              action: "create_chat_window",
            })}
            data-testid="project-chat-bottom-dock-create"
            title={getWindowControlQuickInfoText({
              action: "create_chat_window",
            })}
            {...getWindowControlQuickInfoHandlers({
              action: "create_chat_window",
            })}
          >
            <MdAdd size={14} />
          </button>
        ) : null}
        {showManagerMenu ? (
          <DropdownMenu.Root
            modal={false}
            open={isManagerMenuOpen}
            onOpenChange={setIsManagerMenuOpen}
          >
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={chatMenuTriggerClassName}
                ref={setStripItemNode("manager")}
                aria-label={getWindowControlQuickInfoText({
                  action: "show_chat_windows",
                })}
                title={getWindowControlQuickInfoText({
                  action: "show_chat_windows",
                })}
                data-testid="project-chat-bottom-dock-menu-trigger"
                {...getWindowControlQuickInfoHandlers({
                  action: "show_chat_windows",
                })}
              >
                <RiChat3Line size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                side="top"
                sideOffset={6}
                className="bg-white/98 shadow-slate-950/12 dark:bg-setta-930/98 z-[80] min-w-[15rem] rounded-xl border border-setta-200 p-1 shadow-xl backdrop-blur-md dark:border-setta-800"
                data-testid="project-chat-bottom-dock-menu-content"
              >
                <ProjectChatManager
                  onAfterAction={() => {
                    setIsManagerMenuOpen(false);
                  }}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
        {pillDisplayMode !== "menu"
          ? visiblePills.map((pill) => {
              const baseClass = minimizedTabBaseClassName;
              if (useCompactPills) {
                const pillExitAnimation =
                  pillExitAnimationsById[pill.instanceId];
                return (
                  <button
                    key={pill.instanceId}
                    type="button"
                    className={`${baseClass} w-7 ${pill.isClosed ? "opacity-65" : ""} ${
                      pillExitAnimation
                        ? "pointer-events-none translate-y-2 scale-[0.94] opacity-0 transition-[transform,opacity] duration-[72ms] ease-[cubic-bezier(0.32,0,0.15,1)] motion-reduce:transition-none"
                        : ""
                    }`}
                    onClick={() => {
                      onOpenWindow(pill.instanceId, "pill");
                    }}
                    ref={setStripItemNode(`pill:${pill.instanceId}`)}
                    title={pill.title}
                    aria-label={pill.title}
                    data-testid="project-chat-bottom-dock-pill"
                    data-chat-window-instance-id={pill.instanceId}
                    data-chat-window-pill-exit-animation={
                      pillExitAnimationsById[pill.instanceId] ?? undefined
                    }
                  >
                    <ProjectChatWindowIcon
                      mode={pill.mode}
                      instanceId={pill.instanceId}
                      sectionId={pill.sectionId}
                      className="inline-flex items-center justify-center text-setta-600 dark:text-setta-300"
                      dataTestId="project-chat-bottom-dock-pill-icon"
                    />
                  </button>
                );
              }
              const pillExitAnimation = pillExitAnimationsById[pill.instanceId];
              return (
                <button
                  key={pill.instanceId}
                  type="button"
                  className={`${baseClass} min-w-0 gap-1 px-2 ${pill.isClosed ? "opacity-65" : ""} ${
                    pillExitAnimation
                      ? "pointer-events-none translate-y-2 scale-[0.94] opacity-0 transition-[transform,opacity] duration-[72ms] ease-[cubic-bezier(0.32,0,0.15,1)] motion-reduce:transition-none"
                      : ""
                  }`}
                  onClick={() => {
                    onOpenWindow(pill.instanceId, "pill");
                  }}
                  ref={setStripItemNode(`pill:${pill.instanceId}`)}
                  title={pill.title}
                  data-testid="project-chat-bottom-dock-pill"
                  data-chat-window-instance-id={pill.instanceId}
                  data-chat-window-pill-exit-animation={
                    pillExitAnimationsById[pill.instanceId] ?? undefined
                  }
                >
                  <ProjectChatWindowIcon
                    mode={pill.mode}
                    instanceId={pill.instanceId}
                    sectionId={pill.sectionId}
                    className="inline-flex shrink-0 items-center justify-center text-setta-600 dark:text-setta-300"
                    dataTestId="project-chat-bottom-dock-pill-icon"
                  />
                  <span className="max-w-[9.5rem] truncate">{pill.title}</span>
                </button>
              );
            })
          : null}
      </div>
      {pillDisplayMode === "cycle" ? (
        <button
          type="button"
          className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 bg-setta-50 text-setta-700 shadow-sm transition-colors enabled:hover:bg-setta-100 enabled:hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-setta-700 dark:bg-setta-860 dark:text-setta-200 dark:enabled:hover:bg-setta-800 dark:enabled:hover:text-setta-50"
          ref={setStripItemNode("cycle-right")}
          onClick={onCycleForward}
          disabled={!canCycleForward || maxCycleStartIndex === 0}
          aria-label={getWindowControlQuickInfoText({
            action: "show_more_chat_windows",
          })}
          data-testid="project-chat-bottom-dock-cycle-right"
          {...getWindowControlQuickInfoHandlers({
            action: "show_more_chat_windows",
          })}
        >
          <MdChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}
