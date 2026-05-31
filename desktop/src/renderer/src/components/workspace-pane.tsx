import { Maximize2, Minimize2, Settings, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { SettingsPanel } from "./settings-panel";

type PaneSlot = "bottom" | "right";
export type WorkspacePaneKind = "settings";
type WorkspacePaneRuntime = "renderer-settings";
type WorkspacePaneHost = "renderer";

export interface WorkspacePaneTab {
  id: string;
  kind: WorkspacePaneKind;
  title: string;
}

interface WorkspacePaneState {
  activeTabId: string;
  open: boolean;
  tabs: WorkspacePaneTab[];
}

export function useWorkspacePaneState() {
  const tabCounter = useRef(0);
  const [right, setRight] = useState<WorkspacePaneState>(emptyPaneState);
  const [bottom, setBottom] = useState<WorkspacePaneState>(emptyPaneState);

  const setPaneOpen = useCallback((slot: PaneSlot, open: boolean) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => ({ ...pane, open }));
  }, []);

  const createTab = useCallback((slot: PaneSlot, kind: WorkspacePaneKind) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => {
      tabCounter.current += 1;
      const tab = createWorkspacePaneTab(kind, tabCounter.current, pane.tabs);
      return {
        activeTabId: tab.id,
        open: true,
        tabs: [...pane.tabs, tab],
      };
    });
  }, []);

  const selectTab = useCallback((slot: PaneSlot, tabId: string) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => ({ ...pane, activeTabId: tabId }));
  }, []);

  const closeTab = useCallback((slot: PaneSlot, tabId: string) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => closeWorkspacePaneTab(pane, tabId));
  }, []);

  return {
    bottom,
    closeTab,
    createTab,
    right,
    selectTab,
    setPaneOpen,
  };
}

const emptyPaneState: WorkspacePaneState = {
  activeTabId: "",
  open: false,
  tabs: [],
};

const workspacePaneLabels = {
  settings: "Settings",
} satisfies Record<WorkspacePaneKind, string>;

const workspacePaneIntegrationPlan = {
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
  maximized = false,
  onCloseTab,
  onSelectTab,
  onToggleMaximize,
  slot,
  tabs,
}: {
  activeTabId: string;
  maximized?: boolean;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onToggleMaximize?: () => void;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = slot === "right" ? "Workspace side pane" : "Workspace bottom pane";
  return (
    <section
      aria-label={paneLabel}
      className={workspacePanePanelClass(slot)}
      data-testid={`${slot}-workspace-pane`}
    >
      <header
        className="app-drag relative z-40 flex h-8 shrink-0 items-center gap-1 border-b border-zinc-800 px-1.5"
        data-testid={`${slot}-workspace-pane-header`}
      >
        <nav
          className="app-no-drag flex min-w-0 flex-1 items-center gap-1"
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
        </nav>
        {onToggleMaximize ? (
          <WorkspacePaneMaximizeButton
            maximized={maximized}
            onToggleMaximize={onToggleMaximize}
            slot={slot}
          />
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab ? <WorkspacePaneContent tab={activeTab} /> : <WorkspacePaneEmpty />}
      </div>
    </section>
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
  const paneName = slot === "bottom" ? "bottom" : "side";
  const label = maximized ? `Restore ${paneName} pane` : `Maximize ${paneName} pane`;
  return (
    <button
      aria-label={label}
      className="app-no-drag grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-sm text-zinc-500 outline-none hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100"
      onClick={onToggleMaximize}
      title={label}
      type="button"
    >
      {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function workspacePanePanelClass(slot: PaneSlot) {
  const slotClass =
    slot === "right"
      ? "flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 transition-[width,padding] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]"
      : "flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100 transition-[height,padding] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]";
  return cn(slotClass);
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
      className={cn(
        "app-no-drag group relative flex h-7 min-w-0 max-w-40 items-center gap-1 rounded-sm border px-1.5 text-xs transition-colors",
        active
          ? "border-zinc-700/70 bg-zinc-800/80 text-zinc-100"
          : "border-transparent text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200",
      )}
      data-testid={`workspace-pane-tab-${tab.id}`}
    >
      <span className="relative grid h-4 w-4 shrink-0 place-items-center">
        <span className="grid h-4 w-4 place-items-center transition-opacity group-hover:opacity-0">
          {workspacePaneIcon(tab.kind, "h-3.5 w-3.5")}
        </span>
        <button
          aria-label={`Close ${tab.title}`}
          className="pointer-events-none absolute inset-0 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-zinc-500/85 text-zinc-950 opacity-0 outline-none transition-colors group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-zinc-300 focus:pointer-events-auto focus:opacity-100 focus-visible:bg-zinc-300"
          onClick={onClose}
          type="button"
        >
          <X className="h-2.5 w-2.5 stroke-[3]" />
        </button>
      </span>
      <button
        className="min-w-0 flex-1 cursor-pointer truncate text-left outline-none focus-visible:text-zinc-50 focus-visible:underline focus-visible:decoration-zinc-400 focus-visible:underline-offset-2"
        onClick={onSelect}
        type="button"
      >
        {tab.title}
      </button>
    </div>
  );
}

function WorkspacePaneEmpty() {
  return <div aria-hidden="true" className="h-full bg-zinc-950" />;
}

function WorkspacePaneContent({ tab }: { tab: WorkspacePaneTab }) {
  switch (tab.kind) {
    case "settings":
      return <SettingsPaneSurface />;
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
    case "settings":
      return <Settings className={className} />;
    default:
      return assertWorkspacePaneKind(kind);
  }
}

function assertWorkspacePaneKind(value: never): never {
  throw new Error(`Unhandled workspace pane kind: ${value}`);
}
