import { Maximize2, MessageSquareText, Minimize2, Plus, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { FloatingMenu } from "./floating-menu";
import { SettingsPanel } from "./settings-panel";

type PaneSlot = "bottom" | "grid" | "right";
export type WorkspacePaneKind = "chat" | "settings";
type WorkspacePaneRuntime = "renderer-chat" | "renderer-settings";
type WorkspacePaneHost = "renderer";
export const maxWorkspacePaneCount = 4;

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

export function useWorkspacePaneState() {
  const paneCounter = useRef(1);
  const tabCounter = useRef(1);
  const [panes, setPanes] = useState<WorkspacePaneState[]>(() => [
    createWorkspacePane("workspace_pane_1", createWorkspacePaneTab("chat", 1, [])),
  ]);

  const createPane = useCallback((kind: WorkspacePaneKind) => {
    setPanes((current) => {
      if (current.length >= maxWorkspacePaneCount) {
        return current;
      }
      paneCounter.current += 1;
      tabCounter.current += 1;
      const tab = createWorkspacePaneTab(kind, tabCounter.current, []);
      return [...current, createWorkspacePane(`workspace_pane_${paneCounter.current}`, tab)];
    });
  }, []);

  const createTab = useCallback((paneId: string, kind: WorkspacePaneKind) => {
    setPanes((current) =>
      current.map((pane) => {
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
    );
  }, []);

  const selectTab = useCallback((paneId: string, tabId: string) => {
    setPanes((current) =>
      current.map((pane) => (pane.id === paneId ? { ...pane, activeTabId: tabId } : pane)),
    );
  }, []);

  const closeTab = useCallback((paneId: string, tabId: string) => {
    setPanes((current) => {
      const next = current.map((pane) =>
        pane.id === paneId ? closeWorkspacePaneTab(pane, tabId) : pane,
      );
      const closingPane = next.find((pane) => pane.id === paneId);
      if (!closingPane || closingPane.tabs.length > 0 || next.length === 1) {
        return next;
      }
      return next.filter((pane) => pane.id !== paneId);
    });
  }, []);

  const closePane = useCallback((paneId: string) => {
    setPanes((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((pane) => pane.id !== paneId);
    });
  }, []);

  const openTabKind = useCallback((kind: WorkspacePaneKind) => {
    setPanes((current) => {
      const existing = firstPaneWithTabKind(current, kind);
      if (existing) {
        return current.map((pane) =>
          pane.id === existing.pane.id ? { ...pane, activeTabId: existing.tab.id } : pane,
        );
      }
      if (current.length < maxWorkspacePaneCount) {
        paneCounter.current += 1;
        tabCounter.current += 1;
        const tab = createWorkspacePaneTab(kind, tabCounter.current, []);
        return [...current, createWorkspacePane(`workspace_pane_${paneCounter.current}`, tab)];
      }
      tabCounter.current += 1;
      const tab = createWorkspacePaneTab(kind, tabCounter.current, current[0]?.tabs ?? []);
      return current.map((pane, index) =>
        index === 0
          ? {
              ...pane,
              activeTabId: tab.id,
              tabs: [...pane.tabs, tab],
            }
          : pane,
      );
    });
  }, []);

  return {
    closeTab,
    closePane,
    createPane,
    createTab,
    canCreatePane: canCreateWorkspacePane(panes),
    openTabKind,
    panes,
    selectTab,
  };
}

export function canCreateWorkspacePane(panes: readonly WorkspacePaneState[]) {
  return panes.length < maxWorkspacePaneCount;
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

export function WorkspacePanePanel({
  activeTabId,
  canClosePane = false,
  chromeInsetTop = false,
  initialNewTabMenuOpen = false,
  maximized = false,
  onClosePane,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  onToggleMaximize,
  paneId = "",
  renderTabContent,
  showNewTabButton = true,
  slot = "grid",
  tabs,
}: {
  activeTabId: string;
  canClosePane?: boolean;
  chromeInsetTop?: boolean;
  initialNewTabMenuOpen?: boolean;
  maximized?: boolean;
  onClosePane?: () => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  onToggleMaximize?: () => void;
  paneId?: string;
  renderTabContent?: (tab: WorkspacePaneTab) => ReactNode;
  showNewTabButton?: boolean;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = workspacePaneLabel(slot, paneId);
  return (
    <section
      aria-label={paneLabel}
      className={workspacePanePanelClass(slot, chromeInsetTop)}
      data-testid={`${slot}-workspace-pane`}
    >
      <WorkspacePaneHeader
        activeTabId={activeTabId}
        canClosePane={canClosePane}
        initialNewTabMenuOpen={initialNewTabMenuOpen}
        maximized={maximized}
        onClosePane={onClosePane}
        onCloseTab={onCloseTab}
        onCreateTab={onCreateTab}
        onSelectTab={onSelectTab}
        onToggleMaximize={onToggleMaximize}
        paneLabel={paneLabel}
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

function WorkspacePaneHeader({
  activeTabId,
  canClosePane,
  initialNewTabMenuOpen,
  maximized,
  onClosePane,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  onToggleMaximize,
  paneLabel,
  showNewTabButton,
  slot,
  tabs,
}: {
  activeTabId: string;
  canClosePane: boolean;
  initialNewTabMenuOpen: boolean;
  maximized: boolean;
  onClosePane: (() => void) | undefined;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  onToggleMaximize: (() => void) | undefined;
  paneLabel: string;
  showNewTabButton: boolean;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(initialNewTabMenuOpen);
  return (
    <header
      className="app-drag relative z-40 flex h-8 shrink-0 items-center gap-1 border-b border-zinc-800 px-1.5"
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
        paneLabel={paneLabel}
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
  paneLabel,
  showNewTabButton,
  tabs,
}: {
  activeTabId: string;
  newTabMenuOpen: boolean;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onNewTabMenuOpenChange: (open: boolean) => void;
  onSelectTab: (tabId: string) => void;
  paneLabel: string;
  showNewTabButton: boolean;
  tabs: WorkspacePaneTab[];
}) {
  return (
    <nav
      className="app-no-drag flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden"
      aria-label={`${paneLabel} tabs`}
    >
      {tabs.map((tab) => (
        <WorkspacePaneTabButton
          active={tab.id === activeTabId}
          key={tab.id}
          onClose={() => onCloseTab(tab.id)}
          onSelect={() => onSelectTab(tab.id)}
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

function workspacePanePanelClass(slot: PaneSlot, chromeInsetTop: boolean) {
  const slotClass = workspacePaneSlotClass(slot);
  return cn(slotClass, chromeInsetTop && "pt-10");
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
  onSelect,
  tab,
}: {
  active: boolean;
  onClose: () => void;
  onSelect: () => void;
  tab: WorkspacePaneTab;
}) {
  return (
    <div
      className={workspacePaneTabClass(tab.kind, active)}
      data-testid={`workspace-pane-tab-${tab.id}`}
    >
      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 truncate pr-1 text-left outline-none focus-visible:text-zinc-50 focus-visible:underline focus-visible:decoration-zinc-400 focus-visible:underline-offset-2"
        onClick={onSelect}
        onPointerDown={(event) => event.stopPropagation()}
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

function workspacePaneTabClass(kind: WorkspacePaneKind, active: boolean) {
  const base =
    "app-no-drag group relative flex h-7 min-w-0 max-w-40 items-center rounded-sm border px-1.5 text-xs transition-colors";
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
