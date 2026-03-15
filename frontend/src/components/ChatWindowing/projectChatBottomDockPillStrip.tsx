import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  resolveCycleVisibleCount,
  resolvePillDisplayMode,
  type PillDisplayMode,
} from "components/ChatWindowing/projectChatBottomDockLayout";
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
import type { ChatWindowMode } from "utils/generatedTypes";

export type ChatWindowPillExitAnimationKind = "restore_from_minimize";

export type MinimizedPillStripPill = {
  instanceId: string;
  title: string;
  mode: ChatWindowMode;
  isClosed: boolean;
  sectionId: string | null;
};

type MinimizedPillStripProps = {
  pills: MinimizedPillStripPill[];
  pillExitAnimationsById: Record<string, ChatWindowPillExitAnimationKind>;
  canCreateWindow: boolean;
  showManagerMenu: boolean;
  viewportWidthPx: number;
  onOpenWindow: (instanceId: string, source: "pill" | "menu") => void;
  onCreateWindow: () => void;
};

const CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS = 110;

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function buildPillBaseClass(isActive: boolean): string {
  return isActive
    ? "border-setta-300 bg-setta-100 text-setta-900 shadow-sm shadow-setta-950/10 dark:border-setta-600 dark:bg-setta-780 dark:text-setta-50 dark:shadow-none"
    : "border-setta-250 bg-setta-50 text-setta-700 shadow-sm shadow-setta-950/10 hover:border-setta-300 hover:bg-setta-100 hover:text-setta-900 dark:border-setta-800 dark:bg-setta-860 dark:text-setta-200 dark:shadow-none dark:hover:border-setta-700 dark:hover:bg-setta-800 dark:hover:text-setta-50";
}

export function MinimizedPillStrip({
  pills,
  pillExitAnimationsById,
  canCreateWindow,
  showManagerMenu,
  viewportWidthPx,
  onOpenWindow,
  onCreateWindow,
}: MinimizedPillStripProps) {
  const [pillDisplayMode, setPillDisplayMode] =
    useState<PillDisplayMode>("full");
  const [pillCycleStartIndex, setPillCycleStartIndex] = useState(0);
  const [pillViewportWidthPx, setPillViewportWidthPx] = useState(0);
  const [isManagerMenuOpen, setIsManagerMenuOpen] = useState(false);
  const pillViewportRef = useRef<HTMLDivElement | null>(null);
  const fullMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const compactMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const stripItemNodesRef = useRef<Record<string, HTMLElement | null>>({});
  const previousStripItemRectsRef = useRef<Record<string, DOMRect>>({});
  const stripItemAnimationTimeoutsRef = useRef<Record<string, number>>({});
  const stripItemAnimationFrameRef = useRef<number | null>(null);
  const hasStripMountedRef = useRef(false);
  const minimizedTabBaseClassName = `pointer-events-auto relative inline-flex h-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent text-xs shadow-sm transition-colors will-change-transform ${buildPillBaseClass(false)}`;
  const createTabClassName = `${minimizedTabBaseClassName} w-7`;
  const chatMenuTriggerClassName = `${minimizedTabBaseClassName} w-7`;

  useEffect(() => {
    const viewportNode = pillViewportRef.current;
    if (!viewportNode) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const nextWidthPx = entries[0]?.contentRect.width;
      if (!nextWidthPx) {
        return;
      }
      setPillViewportWidthPx(nextWidthPx);
    });
    observer.observe(viewportNode);
    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const viewportNode = pillViewportRef.current;
    const fullMeasureNode = fullMeasureRowRef.current;
    const compactMeasureNode = compactMeasureRowRef.current;
    if (!viewportNode || !fullMeasureNode || !compactMeasureNode) {
      return;
    }
    const availableWidthPx = viewportNode.clientWidth;
    if (availableWidthPx <= 0) {
      return;
    }
    const nextMode = resolvePillDisplayMode({
      stripPillCount: pills.length,
      availableWidthPx,
      fullWidthPx: fullMeasureNode.scrollWidth,
      compactWidthPx: compactMeasureNode.scrollWidth,
      viewportWidthPx,
    });
    if (nextMode !== pillDisplayMode) {
      setPillDisplayMode(nextMode);
    }
  }, [pillDisplayMode, pillViewportWidthPx, pills, viewportWidthPx]);

  const cycleVisibleCount = useMemo(
    () =>
      resolveCycleVisibleCount({
        pillDisplayMode,
        pillViewportWidthPx,
        stripPillCount: pills.length,
      }),
    [pillDisplayMode, pillViewportWidthPx, pills.length],
  );

  useEffect(() => {
    const maxStartIndex = Math.max(0, pills.length - cycleVisibleCount);
    setPillCycleStartIndex((current) => clampNumber(current, 0, maxStartIndex));
  }, [cycleVisibleCount, pills.length]);

  const visiblePills = useMemo(() => {
    if (pillDisplayMode !== "cycle") {
      return pills;
    }
    return pills.slice(
      pillCycleStartIndex,
      pillCycleStartIndex + cycleVisibleCount,
    );
  }, [cycleVisibleCount, pillCycleStartIndex, pillDisplayMode, pills]);

  const maxCycleStartIndex = Math.max(0, pills.length - cycleVisibleCount);
  const canCycleBackward =
    pillDisplayMode === "cycle" && pillCycleStartIndex > 0;
  const canCycleForward =
    pillDisplayMode === "cycle" && pillCycleStartIndex < maxCycleStartIndex;
  const useCompactPills =
    pillDisplayMode === "compact" || pillDisplayMode === "cycle";

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
    const nextRects: Record<string, DOMRect> = {};
    const animations: Array<{
      itemKey: string;
      node: HTMLElement;
      startingTransform: string;
    }> = [];

    for (const itemKey of renderedStripItemKeys) {
      const node = stripItemNodesRef.current[itemKey];
      if (!node) {
        continue;
      }
      const nextRect = node.getBoundingClientRect();
      nextRects[itemKey] = nextRect;
      const previousRect = previousStripItemRectsRef.current[itemKey];
      if (previousRect) {
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) <= 0.5 && Math.abs(deltaY) <= 0.5) {
          continue;
        }
        clearStripItemAnimation(itemKey);
        node.dataset.chatPillLayoutAnimation = "active";
        node.style.transition = "none";
        node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        animations.push({
          itemKey,
          node,
          startingTransform: "translate(0px, 0px)",
        });
        continue;
      }
      if (!hasStripMountedRef.current) {
        continue;
      }
      clearStripItemAnimation(itemKey);
      node.dataset.chatPillLayoutAnimation = "active";
      node.style.transition = "none";
      node.style.transform = "translateY(8px) scale(0.96)";
      animations.push({
        itemKey,
        node,
        startingTransform: "translateY(0px) scale(1)",
      });
    }

    previousStripItemRectsRef.current = nextRects;

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
        const { itemKey, node, startingTransform } = animation;
        node.style.transition = `transform ${CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1)`;
        node.style.transform = startingTransform;
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
      data-testid="project-chat-bottom-dock-pill-viewport"
    >
      <div
        className="pointer-events-none absolute left-0 top-0 h-0 overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <div
          ref={fullMeasureRowRef}
          className="flex w-max items-center gap-1"
          data-chat-pill-measure-row="full"
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
          data-chat-pill-measure-row="compact"
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
          onClick={() => {
            setPillCycleStartIndex((current) => Math.max(0, current - 1));
          }}
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
              const pillExitAnimation = pillExitAnimationsById[pill.instanceId];
              if (useCompactPills) {
                return (
                  <button
                    key={pill.instanceId}
                    type="button"
                    className={`${minimizedTabBaseClassName} w-7 ${pill.isClosed ? "opacity-65" : ""} ${
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
              return (
                <button
                  key={pill.instanceId}
                  type="button"
                  className={`${minimizedTabBaseClassName} min-w-0 gap-1 px-2 ${pill.isClosed ? "opacity-65" : ""} ${
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
          onClick={() => {
            setPillCycleStartIndex((current) =>
              Math.min(maxCycleStartIndex, current + 1),
            );
          }}
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
