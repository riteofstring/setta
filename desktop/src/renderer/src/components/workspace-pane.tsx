import { Maximize2, MessageSquareText, Minimize2, Plus, Settings, X } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { FloatingMenu } from "./floating-menu";
import { SettingsPanel } from "./settings-panel";

type PaneSlot = "bottom" | "grid" | "right";
export type WorkspacePaneKind = "chat" | "settings";
export type WorkspacePaneLayout = "columns" | "grid" | "rows";
export type WorkspacePaneSplitTarget =
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "left"
  | "right"
  | "top"
  | "top-left"
  | "top-right";
type WorkspacePaneRuntime = "renderer-chat" | "renderer-settings";
type WorkspacePaneHost = "renderer";
export const maxWorkspacePaneCount = 4;
const workspacePaneTabDragMimeType = "application/x-setta-workspace-pane-tab";

export interface WorkspacePaneTab {
  id: string;
  kind: WorkspacePaneKind;
  title: string;
}

export interface WorkspacePaneState {
  id: string;
  activeTabId: string;
  tabs: WorkspacePaneTab[];
}

export interface WorkspacePaneTabDragPayload {
  sourcePaneId: string;
  tabId: string;
}

interface WorkspacePaneCollectionState {
  layout: WorkspacePaneLayout;
  panes: WorkspacePaneState[];
}

export function useWorkspacePaneState() {
  const paneCounter = useRef(1);
  const tabCounter = useRef(1);
  const [state, setState] = useState<WorkspacePaneCollectionState>(() => ({
    layout: "grid",
    panes: [createWorkspacePane("workspace_pane_1", createWorkspacePaneTab("chat", 1, []))],
  }));

  const createPane = useCallback((kind: WorkspacePaneKind) => {
    setState((current) => {
      if (current.panes.length >= maxWorkspacePaneCount) {
        return current;
      }
      paneCounter.current += 1;
      tabCounter.current += 1;
      const tab = createWorkspacePaneTab(kind, tabCounter.current, []);
      const panes = [
        ...current.panes,
        createWorkspacePane(`workspace_pane_${paneCounter.current}`, tab),
      ];
      return {
        layout: workspacePaneLayoutAfterAppend(current.layout, panes.length),
        panes,
      };
    });
  }, []);

  const createTab = useCallback((paneId: string, kind: WorkspacePaneKind) => {
    setState((current) => ({
      ...current,
      panes: current.panes.map((pane) => {
        if (pane.id !== paneId) {
          return pane;
        }
        tabCounter.current += 1;
        const tab = createWorkspacePaneTab(kind, tabCounter.current, pane.tabs);
        return {
          ...pane,
          activeTabId: tab.id,
          tabs: [...pane.tabs, tab],
        };
      }),
    }));
  }, []);

  const selectTab = useCallback((paneId: string, tabId: string) => {
    setState((current) => ({
      ...current,
      panes: current.panes.map((pane) =>
        pane.id === paneId ? { ...pane, activeTabId: tabId } : pane,
      ),
    }));
  }, []);

  const closeTab = useCallback((paneId: string, tabId: string) => {
    setState((current) => {
      const next = current.panes.map((pane) =>
        pane.id === paneId ? closeWorkspacePaneTab(pane, tabId) : pane,
      );
      const closingPane = next.find((pane) => pane.id === paneId);
      if (!closingPane || closingPane.tabs.length > 0 || next.length === 1) {
        return { ...current, panes: next };
      }
      const panes = next.filter((pane) => pane.id !== paneId);
      return {
        layout: normalizeWorkspacePaneLayout(current.layout, panes.length),
        panes,
      };
    });
  }, []);

  const closePane = useCallback((paneId: string) => {
    setState((current) => {
      if (current.panes.length === 1) {
        return current;
      }
      const panes = current.panes.filter((pane) => pane.id !== paneId);
      return {
        layout: normalizeWorkspacePaneLayout(current.layout, panes.length),
        panes,
      };
    });
  }, []);

  const openTabKind = useCallback((kind: WorkspacePaneKind) => {
    setState((current) => {
      const existing = firstPaneWithTabKind(current.panes, kind);
      if (existing) {
        return {
          ...current,
          panes: current.panes.map((pane) =>
            pane.id === existing.pane.id ? { ...pane, activeTabId: existing.tab.id } : pane,
          ),
        };
      }
      if (current.panes.length < maxWorkspacePaneCount) {
        paneCounter.current += 1;
        tabCounter.current += 1;
        const tab = createWorkspacePaneTab(kind, tabCounter.current, []);
        const panes = [
          ...current.panes,
          createWorkspacePane(`workspace_pane_${paneCounter.current}`, tab),
        ];
        return {
          layout: workspacePaneLayoutAfterAppend(current.layout, panes.length),
          panes,
        };
      }
      tabCounter.current += 1;
      const tab = createWorkspacePaneTab(kind, tabCounter.current, current.panes[0]?.tabs ?? []);
      return {
        ...current,
        panes: current.panes.map((pane, index) =>
          index === 0
            ? {
                ...pane,
                activeTabId: tab.id,
                tabs: [...pane.tabs, tab],
              }
            : pane,
        ),
      };
    });
  }, []);

  const splitTab = useCallback(
    (sourcePaneId: string, tabId: string, target: WorkspacePaneSplitTarget) => {
      setState((current) => {
        const sourcePane = current.panes.find((pane) => pane.id === sourcePaneId);
        const tab = sourcePane?.tabs.find((candidate) => candidate.id === tabId);
        if (!sourcePane || !tab || !canSplitWorkspacePaneTab(current.panes, sourcePaneId)) {
          return current;
        }

        const sourceHasOneTab = sourcePane.tabs.length === 1;
        const cloneOnlyTab = sourceHasOneTab && current.panes.length === 1;
        const splitTab = cloneOnlyTab
          ? createWorkspacePaneTab(tab.kind, (tabCounter.current += 1), [])
          : tab;
        paneCounter.current += 1;
        const splitPane = createWorkspacePane(`workspace_pane_${paneCounter.current}`, splitTab);
        const panesWithoutSplitTab = sourceHasOneTab
          ? cloneOnlyTab
            ? current.panes
            : current.panes.filter((pane) => pane.id !== sourcePane.id)
          : current.panes.map((pane) =>
              pane.id === sourcePane.id ? closeWorkspacePaneTab(pane, tab.id) : pane,
            );
        const panes = insertWorkspacePaneAtSplitTarget(panesWithoutSplitTab, splitPane, target);
        return {
          layout: workspacePaneLayoutForSplitTarget(target, panes.length),
          panes,
        };
      });
    },
    [],
  );

  return {
    closeTab,
    closePane,
    createPane,
    createTab,
    canCreatePane: canCreateWorkspacePane(state.panes),
    layout: state.layout,
    openTabKind,
    panes: state.panes,
    selectTab,
    splitTab,
  };
}

export function canCreateWorkspacePane(panes: readonly WorkspacePaneState[]) {
  return panes.length < maxWorkspacePaneCount;
}

export function canSplitWorkspacePaneTab(
  panes: readonly WorkspacePaneState[],
  sourcePaneId: string,
) {
  const sourcePane = panes.find((pane) => pane.id === sourcePaneId);
  if (!sourcePane) {
    return false;
  }
  if (panes.length < maxWorkspacePaneCount) {
    return true;
  }
  return sourcePane.tabs.length === 1 && panes.length > 1;
}

const workspacePaneLabels = {
  chat: "Chat",
  settings: "Settings",
} satisfies Record<WorkspacePaneKind, string>;

const workspacePaneActions = ["chat", "settings"] satisfies WorkspacePaneKind[];

const workspacePaneIntegrationPlan = {
  chat: {
    host: "renderer",
    runtime: "renderer-chat",
  },
  settings: {
    host: "renderer",
    runtime: "renderer-settings",
  },
} satisfies Record<
  WorkspacePaneKind,
  {
    host: WorkspacePaneHost;
    runtime: WorkspacePaneRuntime;
  }
>;

function createWorkspacePane(id: string, tab: WorkspacePaneTab): WorkspacePaneState {
  return {
    activeTabId: tab.id,
    id,
    tabs: [tab],
  };
}

function createWorkspacePaneTab(
  kind: WorkspacePaneKind,
  idIndex: number,
  tabs: WorkspacePaneTab[],
): WorkspacePaneTab {
  const label = workspacePaneLabels[kind];
  const kindCount = tabs.filter((tab) => tab.kind === kind).length + 1;
  return {
    id: `pane_${kind}_${idIndex}`,
    kind,
    title: kindCount === 1 ? label : `${label} ${kindCount}`,
  };
}

function firstPaneWithTabKind(panes: WorkspacePaneState[], kind: WorkspacePaneKind) {
  for (const pane of panes) {
    const tab = pane.tabs.find((candidate) => candidate.kind === kind);
    if (tab) {
      return { pane, tab };
    }
  }
  return null;
}

function closeWorkspacePaneTab(pane: WorkspacePaneState, tabId: string): WorkspacePaneState {
  const closingIndex = pane.tabs.findIndex((tab) => tab.id === tabId);
  if (closingIndex === -1) {
    return pane;
  }
  const tabs = pane.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId =
    pane.activeTabId === tabId ? (tabs[Math.max(0, closingIndex - 1)]?.id ?? "") : pane.activeTabId;
  return {
    ...pane,
    activeTabId,
    tabs,
  };
}

function workspacePaneLayoutAfterAppend(
  current: WorkspacePaneLayout,
  count: number,
): WorkspacePaneLayout {
  if (count <= 1) {
    return "grid";
  }
  if (count === 2) {
    return current === "rows" ? "rows" : "columns";
  }
  return "grid";
}

function normalizeWorkspacePaneLayout(
  current: WorkspacePaneLayout,
  count: number,
): WorkspacePaneLayout {
  if (count <= 1) {
    return "grid";
  }
  if (count === 2) {
    return current === "rows" ? "rows" : "columns";
  }
  return "grid";
}

function workspacePaneLayoutForSplitTarget(
  target: WorkspacePaneSplitTarget,
  count: number,
): WorkspacePaneLayout {
  if (count <= 1) {
    return "grid";
  }
  if (count > 2 || isQuadrantSplitTarget(target)) {
    return "grid";
  }
  return target === "top" || target === "bottom" ? "rows" : "columns";
}

function isQuadrantSplitTarget(target: WorkspacePaneSplitTarget) {
  return (
    target === "top-left" ||
    target === "top-right" ||
    target === "bottom-left" ||
    target === "bottom-right"
  );
}

function insertWorkspacePaneAtSplitTarget(
  panes: WorkspacePaneState[],
  pane: WorkspacePaneState,
  target: WorkspacePaneSplitTarget,
) {
  const next = [...panes];
  next.splice(workspacePaneSplitInsertionIndex(target, panes.length + 1), 0, pane);
  return next.slice(0, maxWorkspacePaneCount);
}

function workspacePaneSplitInsertionIndex(target: WorkspacePaneSplitTarget, count: number) {
  switch (target) {
    case "left":
    case "top":
    case "top-left":
      return 0;
    case "right":
    case "top-right":
      return Math.min(1, count - 1);
    case "bottom-left":
      return Math.min(2, count - 1);
    case "bottom":
    case "bottom-right":
      return count - 1;
    default:
      return assertWorkspacePaneSplitTarget(target);
  }
}

export function WorkspacePanePanel({
  activeTabId,
  avoidShellLeftControls,
  avoidShellRightControls,
  canClosePane,
  inShellTopBar,
  initialNewTabMenuOpen,
  maximized,
  onClosePane,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  onTabDragEnd,
  onTabDragStart,
  onToggleMaximize,
  paneId,
  renderTabContent,
  shellLeftInsetClass,
  shellRightInsetClass,
  showNewTabButton,
  slot,
  tabs,
}: WorkspacePanePanelProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = workspacePaneLabel(slot, paneId);
  return (
    <section
      aria-label={paneLabel}
      className={workspacePanePanelClass(slot)}
      data-testid={`${slot}-workspace-pane`}
    >
      <WorkspacePaneHeader
        activeTabId={activeTabId}
        avoidShellLeftControls={avoidShellLeftControls}
        avoidShellRightControls={avoidShellRightControls}
        canClosePane={canClosePane}
        inShellTopBar={inShellTopBar}
        initialNewTabMenuOpen={initialNewTabMenuOpen}
        maximized={maximized}
        onClosePane={onClosePane}
        onCloseTab={onCloseTab}
        onCreateTab={onCreateTab}
        onSelectTab={onSelectTab}
        onTabDragEnd={onTabDragEnd}
        onTabDragStart={onTabDragStart}
        onToggleMaximize={onToggleMaximize}
        paneLabel={paneLabel}
        paneId={paneId}
        shellLeftInsetClass={shellLeftInsetClass}
        shellRightInsetClass={shellRightInsetClass}
        showNewTabButton={showNewTabButton}
        slot={slot}
        tabs={tabs}
      />
      <WorkspacePaneBody
        activeTab={activeTab}
        onCreateTab={onCreateTab}
        renderTabContent={renderTabContent}
      />
    </section>
  );
}

interface WorkspacePanePanelProps {
  activeTabId: string;
  avoidShellLeftControls: boolean;
  avoidShellRightControls: boolean;
  canClosePane: boolean;
  inShellTopBar: boolean;
  initialNewTabMenuOpen: boolean;
  maximized: boolean;
  onClosePane?: () => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  onTabDragEnd?: () => void;
  onTabDragStart?: (payload: WorkspacePaneTabDragPayload) => void;
  onToggleMaximize?: () => void;
  paneId: string;
  renderTabContent?: (tab: WorkspacePaneTab) => ReactNode;
  shellLeftInsetClass: string;
  shellRightInsetClass: string;
  showNewTabButton: boolean;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}

function WorkspacePaneHeader({
  activeTabId,
  avoidShellLeftControls,
  avoidShellRightControls,
  canClosePane,
  inShellTopBar,
  initialNewTabMenuOpen,
  maximized,
  onClosePane,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  onTabDragEnd,
  onTabDragStart,
  onToggleMaximize,
  paneLabel,
  paneId,
  shellLeftInsetClass,
  shellRightInsetClass,
  showNewTabButton,
  slot,
  tabs,
}: {
  activeTabId: string;
  avoidShellLeftControls: boolean;
  avoidShellRightControls: boolean;
  canClosePane: boolean;
  inShellTopBar: boolean;
  initialNewTabMenuOpen: boolean;
  maximized: boolean;
  onClosePane: (() => void) | undefined;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  onTabDragEnd: (() => void) | undefined;
  onTabDragStart: ((payload: WorkspacePaneTabDragPayload) => void) | undefined;
  onToggleMaximize: (() => void) | undefined;
  paneLabel: string;
  paneId: string;
  shellLeftInsetClass: string;
  shellRightInsetClass: string;
  showNewTabButton: boolean;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(initialNewTabMenuOpen);
  return (
    <header
      className={workspacePaneHeaderClass({
        avoidShellLeftControls,
        avoidShellRightControls,
        inShellTopBar,
        shellLeftInsetClass,
        shellRightInsetClass,
      })}
      data-in-shell-top-bar={inShellTopBar ? "true" : "false"}
      data-testid={`${slot}-workspace-pane-header`}
    >
      <WorkspacePaneTabNav
        activeTabId={activeTabId}
        newTabMenuOpen={newTabMenuOpen}
        onCloseTab={onCloseTab}
        onCreateTab={(kind) => {
          setNewTabMenuOpen(false);
          onCreateTab(kind);
        }}
        onNewTabMenuOpenChange={setNewTabMenuOpen}
        onSelectTab={onSelectTab}
        onTabDragEnd={onTabDragEnd}
        onTabDragStart={onTabDragStart}
        paneLabel={paneLabel}
        paneId={paneId}
        showNewTabButton={showNewTabButton}
        tabs={tabs}
      />
      {onClosePane && canClosePane ? (
        <WorkspacePaneCloseButton onClosePane={onClosePane} paneLabel={paneLabel} />
      ) : null}
      {onToggleMaximize ? (
        <WorkspacePaneMaximizeButton
          maximized={maximized}
          onToggleMaximize={onToggleMaximize}
          slot={slot}
        />
      ) : null}
    </header>
  );
}

function WorkspacePaneTabNav({
  activeTabId,
  newTabMenuOpen,
  onCloseTab,
  onCreateTab,
  onNewTabMenuOpenChange,
  onSelectTab,
  onTabDragEnd,
  onTabDragStart,
  paneLabel,
  paneId,
  showNewTabButton,
  tabs,
}: {
  activeTabId: string;
  newTabMenuOpen: boolean;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onNewTabMenuOpenChange: (open: boolean) => void;
  onSelectTab: (tabId: string) => void;
  onTabDragEnd: (() => void) | undefined;
  onTabDragStart: ((payload: WorkspacePaneTabDragPayload) => void) | undefined;
  paneLabel: string;
  paneId: string;
  showNewTabButton: boolean;
  tabs: WorkspacePaneTab[];
}) {
  return (
    <nav
      className="app-drag flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden"
      aria-label={`${paneLabel} tabs`}
    >
      {tabs.map((tab) => (
        <WorkspacePaneTabButton
          active={tab.id === activeTabId}
          key={tab.id}
          onClose={() => onCloseTab(tab.id)}
          onDragEnd={onTabDragEnd}
          onDragStart={onTabDragStart}
          onSelect={() => onSelectTab(tab.id)}
          paneId={paneId}
          tab={tab}
        />
      ))}
      <WorkspacePaneNewTabSlot
        onCreateTab={onCreateTab}
        onOpenChange={onNewTabMenuOpenChange}
        open={newTabMenuOpen}
        show={showNewTabButton}
      />
    </nav>
  );
}

function WorkspacePaneBody({
  activeTab,
  onCreateTab,
  renderTabContent,
}: {
  activeTab: WorkspacePaneTab | null;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  renderTabContent: ((tab: WorkspacePaneTab) => ReactNode) | undefined;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {activeTab ? (
        <WorkspacePaneContent renderTabContent={renderTabContent} tab={activeTab} />
      ) : (
        <WorkspacePaneEmpty onCreateTab={onCreateTab} />
      )}
    </div>
  );
}

function workspacePaneLabel(slot: PaneSlot, paneId: string) {
  if (slot === "right") {
    return "Workspace side pane";
  }
  if (slot === "bottom") {
    return "Workspace bottom pane";
  }
  return paneId ? `Workspace pane ${paneId}` : "Workspace pane";
}

function WorkspacePaneNewTabSlot({
  onCreateTab,
  onOpenChange,
  open,
  show,
}: {
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  show: boolean;
}) {
  if (!show) {
    return null;
  }
  return (
    <WorkspacePaneNewTabMenu onCreateTab={onCreateTab} onOpenChange={onOpenChange} open={open} />
  );
}

function WorkspacePaneMaximizeButton({
  maximized,
  onToggleMaximize,
  slot,
}: {
  maximized: boolean;
  onToggleMaximize: () => void;
  slot: PaneSlot;
}) {
  const paneName = workspacePaneMaximizeName(slot);
  const label = maximized ? `Restore ${paneName} pane` : `Maximize ${paneName} pane`;
  return (
    <button
      aria-label={label}
      className="app-no-drag grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-sm text-zinc-600 outline-none hover:bg-zinc-800/80 hover:text-zinc-300 focus-visible:bg-zinc-800/80 focus-visible:text-zinc-300"
      onClick={onToggleMaximize}
      title={label}
      type="button"
    >
      {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function workspacePaneMaximizeName(slot: PaneSlot) {
  switch (slot) {
    case "bottom":
      return "bottom";
    case "right":
      return "side";
    case "grid":
      return "workspace";
    default:
      return assertPaneSlot(slot);
  }
}

function WorkspacePaneCloseButton({
  onClosePane,
  paneLabel,
}: {
  onClosePane: () => void;
  paneLabel: string;
}) {
  return (
    <button
      aria-label={`Close ${paneLabel}`}
      className="app-no-drag grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-sm text-zinc-600 outline-none hover:bg-zinc-800/80 hover:text-zinc-300 focus-visible:bg-zinc-800/80 focus-visible:text-zinc-300"
      onClick={onClosePane}
      title={`Close ${paneLabel}`}
      type="button"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function workspacePaneHeaderClass({
  avoidShellLeftControls,
  avoidShellRightControls,
  inShellTopBar,
  shellLeftInsetClass,
  shellRightInsetClass,
}: {
  avoidShellLeftControls: boolean;
  avoidShellRightControls: boolean;
  inShellTopBar: boolean;
  shellLeftInsetClass: string;
  shellRightInsetClass: string;
}) {
  return cn(
    "app-drag relative z-40 flex shrink-0 items-center gap-1 border-b border-zinc-800 px-1.5",
    inShellTopBar ? "h-10" : "h-8",
    inShellTopBar && avoidShellLeftControls && shellLeftInsetClass,
    inShellTopBar && avoidShellRightControls && shellRightInsetClass,
  );
}

function workspacePanePanelClass(slot: PaneSlot) {
  const slotClass = workspacePaneSlotClass(slot);
  return cn(slotClass);
}

function workspacePaneSlotClass(slot: PaneSlot) {
  switch (slot) {
    case "bottom":
      return "flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100";
    case "right":
      return "flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100";
    case "grid":
      return "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-950 text-zinc-100";
    default:
      return assertPaneSlot(slot);
  }
}

function WorkspacePaneTabButton({
  active,
  onClose,
  onDragEnd,
  onDragStart,
  onSelect,
  paneId,
  tab,
}: {
  active: boolean;
  onClose: () => void;
  onDragEnd: (() => void) | undefined;
  onDragStart: ((payload: WorkspacePaneTabDragPayload) => void) | undefined;
  onSelect: () => void;
  paneId: string;
  tab: WorkspacePaneTab;
}) {
  const dragTitle = `Drag ${tab.title} to split pane`;
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.stopPropagation();
    const payload = { sourcePaneId: paneId, tabId: tab.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(workspacePaneTabDragMimeType, JSON.stringify(payload));
    onDragStart?.(payload);
  };
  const handleDragEnd = (event: DragEvent<HTMLElement>) => {
    event.stopPropagation();
    onDragEnd?.();
  };

  return (
    <div
      className={workspacePaneTabClass(tab.kind, active)}
      draggable
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      data-testid={`workspace-pane-tab-${tab.id}`}
      title={dragTitle}
    >
      <button
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1 truncate pr-1 text-left outline-none active:cursor-grabbing focus-visible:text-zinc-50 focus-visible:underline focus-visible:decoration-zinc-400 focus-visible:underline-offset-2"
        draggable
        onClick={onSelect}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        title={dragTitle}
        type="button"
      >
        <span className="relative grid h-4 w-4 shrink-0 place-items-center">
          {workspacePaneIcon(tab.kind, "h-3.5 w-3.5")}
          <span aria-hidden="true" className={workspacePaneTabCloseOverlayClass(tab.kind)}>
            <X className="h-3 w-3 stroke-[2.5]" />
          </span>
        </span>
        <span className="min-w-0 truncate">{tab.title}</span>
      </button>
      <button
        aria-label={`Close ${tab.title}`}
        className="absolute top-1.5 left-1.5 z-10 grid h-4 w-4 cursor-pointer place-items-center rounded-sm text-zinc-100 opacity-0 outline-none transition-opacity hover:bg-zinc-700 focus-visible:bg-zinc-700 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title={`Close ${tab.title}`}
        type="button"
      >
        <X className="h-3 w-3 stroke-[2.5]" />
      </button>
    </div>
  );
}

export function readWorkspacePaneTabDragPayload(
  event: DragEvent<HTMLElement>,
): WorkspacePaneTabDragPayload | null {
  const raw = event.dataTransfer.getData(workspacePaneTabDragMimeType);
  if (!raw) {
    return null;
  }
  const value = JSON.parse(raw) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    !("sourcePaneId" in value) ||
    !("tabId" in value)
  ) {
    throw new Error("Workspace pane tab drag payload is malformed.");
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.sourcePaneId !== "string" || typeof payload.tabId !== "string") {
    throw new Error("Workspace pane tab drag payload fields must be strings.");
  }
  return {
    sourcePaneId: payload.sourcePaneId,
    tabId: payload.tabId,
  };
}

function workspacePaneTabClass(kind: WorkspacePaneKind, active: boolean) {
  const base =
    "app-no-drag group relative flex h-7 min-w-0 max-w-40 cursor-grab items-center rounded-sm border px-1.5 text-xs transition-colors active:cursor-grabbing";
  if (kind === "chat") {
    return cn(
      base,
      active
        ? "border-zinc-700 bg-zinc-900 text-zinc-50 shadow-inner shadow-black/30"
        : "border-zinc-900/80 bg-zinc-900/45 text-zinc-500 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200",
    );
  }
  return cn(
    base,
    active
      ? "border-zinc-700/70 bg-zinc-800/80 text-zinc-100"
      : "border-transparent text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200",
  );
}

function workspacePaneTabCloseOverlayClass(kind: WorkspacePaneKind) {
  return cn(
    "absolute inset-0 grid place-items-center rounded-sm text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
    kind === "chat" ? "bg-zinc-900" : "bg-zinc-800",
  );
}

function WorkspacePaneNewTabMenu({
  onCreateTab,
  onOpenChange,
  open,
}: {
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <div className="app-no-drag relative shrink-0" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="New pane tab"
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-sm text-zinc-600 outline-none hover:bg-zinc-900 hover:text-zinc-300 focus-visible:bg-zinc-900 focus-visible:text-zinc-300"
        onClick={() => onOpenChange(!open)}
        onPointerDown={(event) => event.stopPropagation()}
        ref={anchorRef}
        title="New pane tab"
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        ariaLabel="New pane tab options"
        className="w-36 rounded-sm border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-black/35"
        menuRef={menuRef}
        open={open}
        placement="bottom"
        role="menu"
      >
        {workspacePaneActions.map((kind) => {
          const label = workspacePaneLabels[kind];
          return (
            <button
              className="flex h-6 w-full cursor-pointer items-center gap-2 px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              key={kind}
              onClick={() => onCreateTab(kind)}
              onPointerDown={(event) => event.stopPropagation()}
              role="menuitem"
              type="button"
            >
              {workspacePaneIcon(kind, "h-3.5 w-3.5 shrink-0 text-zinc-500")}
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </FloatingMenu>
    </div>
  );
}

function WorkspacePaneEmpty({ onCreateTab }: { onCreateTab: (kind: WorkspacePaneKind) => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950 px-4">
      <div className="flex items-center gap-1.5">
        {workspacePaneActions.map((kind) => (
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs text-zinc-400 outline-none hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100"
            key={kind}
            onClick={() => onCreateTab(kind)}
            type="button"
          >
            {workspacePaneIcon(kind, "h-3.5 w-3.5 shrink-0")}
            <span>{workspacePaneLabels[kind]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspacePaneContent({
  renderTabContent,
  tab,
}: {
  renderTabContent: ((tab: WorkspacePaneTab) => ReactNode) | undefined;
  tab: WorkspacePaneTab;
}) {
  if (renderTabContent) {
    return renderTabContent(tab);
  }
  switch (tab.kind) {
    case "settings":
      return <SettingsPaneSurface />;
    case "chat":
      throw new Error("Chat workspace pane requires renderTabContent");
    default:
      return assertWorkspacePaneKind(tab.kind);
  }
}

function SettingsPaneSurface() {
  const integration = workspacePaneIntegrationPlan.settings;
  return (
    <div
      className="h-full min-h-0"
      data-pane-host={integration.host}
      data-pane-runtime={integration.runtime}
    >
      <SettingsPanel />
    </div>
  );
}

function workspacePaneIcon(kind: WorkspacePaneKind, className: string) {
  switch (kind) {
    case "chat":
      return <MessageSquareText className={className} />;
    case "settings":
      return <Settings className={className} />;
    default:
      return assertWorkspacePaneKind(kind);
  }
}

function assertWorkspacePaneKind(value: never): never {
  throw new Error(`Unhandled workspace pane kind: ${value}`);
}

function assertPaneSlot(value: never): never {
  throw new Error(`Unhandled workspace pane slot: ${value}`);
}

function assertWorkspacePaneSplitTarget(value: never): never {
  throw new Error(`Unhandled workspace pane split target: ${value}`);
}
