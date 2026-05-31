import {
  FileText,
  GitCompareArrows,
  Globe2,
  Maximize2,
  Minimize2,
  PanelTop,
  Plus,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { SettingsPanel } from "./settings-panel";

type PaneSlot = "bottom" | "right";
type WorkspacePaneKind = "browser" | "canvas" | "diffs" | "file" | "settings" | "terminal";
type WorkspacePaneRuntime =
  | "chromium-browser"
  | "libghostty"
  | "pierre-diffs"
  | "pierre-trees"
  | "renderer-settings"
  | "xyflow";
type WorkspacePaneHost = "electron" | "native" | "renderer";

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
  browser: "Browser",
  canvas: "Canvas",
  diffs: "Diffs",
  file: "Files",
  settings: "Settings",
  terminal: "Terminal",
} satisfies Record<WorkspacePaneKind, string>;

const workspacePaneActions = [
  "canvas",
  "file",
  "diffs",
  "browser",
  "terminal",
  "settings",
] satisfies WorkspacePaneKind[];

const workspacePaneIntegrationPlan = {
  browser: {
    host: "electron",
    runtime: "chromium-browser",
  },
  canvas: {
    host: "renderer",
    runtime: "xyflow",
  },
  diffs: {
    host: "renderer",
    runtime: "pierre-diffs",
  },
  file: {
    host: "renderer",
    runtime: "pierre-trees",
  },
  settings: {
    host: "renderer",
    runtime: "renderer-settings",
  },
  terminal: {
    host: "native",
    runtime: "libghostty",
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
  chromeInsetTop = false,
  maximized = false,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  onToggleMaximized,
  slot,
  tabs,
}: {
  activeTabId: string;
  chromeInsetTop?: boolean;
  maximized?: boolean;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  onToggleMaximized?: () => void;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = slot === "right" ? "Workspace side pane" : "Workspace bottom pane";
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  return (
    <section
      aria-label={paneLabel}
      className={workspacePanePanelClass({ chromeInsetTop, maximized, slot })}
      data-testid={`${slot}-workspace-pane`}
    >
      <header className="app-no-drag flex h-7 shrink-0 items-center gap-1 border-b border-zinc-800 px-1.5">
        {tabs.length > 0 ? (
          <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label={`${paneLabel} tabs`}>
            {tabs.map((tab) => (
              <WorkspacePaneTabButton
                active={tab.id === activeTabId}
                key={tab.id}
                onClose={() => onCloseTab(tab.id)}
                onSelect={() => onSelectTab(tab.id)}
                tab={tab}
              />
            ))}
            <WorkspacePaneNewTabMenu
              onCreateTab={(kind) => {
                setNewTabMenuOpen(false);
                onCreateTab(kind);
              }}
              onOpenChange={setNewTabMenuOpen}
              open={newTabMenuOpen}
            />
          </nav>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {onToggleMaximized ? (
          <WorkspacePaneMaximizeButton
            label={paneLabel}
            maximized={maximized}
            onClick={onToggleMaximized}
          />
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab ? (
          <WorkspacePaneContent tab={activeTab} />
        ) : (
          <WorkspacePaneEmpty onCreateTab={onCreateTab} />
        )}
      </div>
    </section>
  );
}

function workspacePanePanelClass({
  chromeInsetTop,
  maximized,
  slot,
}: {
  chromeInsetTop: boolean;
  maximized: boolean;
  slot: PaneSlot;
}) {
  const slotClass =
    slot === "right"
      ? "flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100"
      : bottomPanePanelClass(maximized);
  return cn(slotClass, chromeInsetTop && "pt-14");
}

function bottomPanePanelClass(maximized: boolean) {
  return maximized
    ? "flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100"
    : "flex h-72 min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100";
}

function WorkspacePaneMaximizeButton({
  label,
  maximized,
  onClick,
}: {
  label: string;
  maximized: boolean;
  onClick: () => void;
}) {
  const buttonLabel = maximized ? `Restore ${label}` : `Maximize ${label}`;
  return (
    <button
      aria-label={buttonLabel}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-zinc-500 outline-none hover:bg-zinc-900 hover:text-zinc-100 focus-visible:bg-zinc-900 focus-visible:text-zinc-100"
      onClick={onClick}
      title={buttonLabel}
      type="button"
    >
      {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
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
        "group relative flex h-6 min-w-0 max-w-40 items-center gap-1 rounded-[3px] px-1.5 text-xs transition-colors",
        active
          ? "bg-zinc-800/70 text-zinc-100 shadow-[inset_0_-1px_0_rgba(212,212,216,0.55)]"
          : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200",
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

function WorkspacePaneNewTabMenu({
  onCreateTab,
  onOpenChange,
  open,
}: {
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <div className="relative shrink-0">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="New pane tab"
        className="grid h-6 w-6 cursor-pointer place-items-center rounded-sm text-zinc-500 outline-none hover:bg-zinc-900 hover:text-zinc-100 focus-visible:bg-zinc-900 focus-visible:text-zinc-100"
        onClick={() => onOpenChange(!open)}
        title="New pane tab"
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          className="absolute top-7 left-0 z-30 w-36 rounded-sm border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-black/35"
          role="menu"
        >
          {workspacePaneActions.map((kind) => {
            const label = workspacePaneLabels[kind];
            return (
              <button
                className="flex h-6 w-full cursor-pointer items-center gap-2 px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                key={kind}
                onClick={() => onCreateTab(kind)}
                role="menuitem"
                type="button"
              >
                {workspacePaneIcon(kind, "h-3.5 w-3.5 shrink-0 text-zinc-500")}
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function WorkspacePaneActionButton({
  kind,
  onClick,
  showLabel,
}: {
  kind: WorkspacePaneKind;
  onClick: () => void;
  showLabel: boolean;
}) {
  const label = workspacePaneLabels[kind];
  return (
    <button
      aria-label={`New ${label}`}
      className={
        showLabel
          ? "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          : "inline-flex h-6 w-6 items-center justify-center rounded-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      }
      onClick={onClick}
      title={`New ${label}`}
      type="button"
    >
      {workspacePaneIcon(kind, "h-3.5 w-3.5 shrink-0")}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

function WorkspacePaneEmpty({ onCreateTab }: { onCreateTab: (kind: WorkspacePaneKind) => void }) {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="flex flex-wrap justify-center gap-1">
        {workspacePaneActions.map((kind) => (
          <WorkspacePaneActionButton
            key={kind}
            kind={kind}
            onClick={() => onCreateTab(kind)}
            showLabel
          />
        ))}
      </div>
    </div>
  );
}

function WorkspacePaneContent({ tab }: { tab: WorkspacePaneTab }) {
  switch (tab.kind) {
    case "browser":
      return <BrowserPaneSurface />;
    case "canvas":
      return <CanvasPaneSurface />;
    case "diffs":
      return <DiffsPaneSurface />;
    case "file":
      return <FilesPaneSurface />;
    case "settings":
      return <SettingsPaneSurface />;
    case "terminal":
      return <TerminalPaneSurface />;
    default:
      return assertWorkspacePaneKind(tab.kind);
  }
}

function BrowserPaneSurface() {
  return <WorkspacePaneRuntimeFrame kind="browser" />;
}

function CanvasPaneSurface() {
  return <WorkspacePaneRuntimeFrame kind="canvas" />;
}

function DiffsPaneSurface() {
  return <WorkspacePaneRuntimeFrame kind="diffs" />;
}

function FilesPaneSurface() {
  return <WorkspacePaneRuntimeFrame kind="file" />;
}

function TerminalPaneSurface() {
  const integration = workspacePaneIntegrationPlan.terminal;
  return (
    <div
      className="h-full bg-zinc-950 p-2 font-mono text-xs text-zinc-500"
      data-pane-host={integration.host}
      data-pane-runtime={integration.runtime}
    >
      <span className="text-zinc-300">$</span>
    </div>
  );
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

function WorkspacePaneRuntimeFrame({
  kind,
}: {
  kind: Exclude<WorkspacePaneKind, "settings" | "terminal">;
}) {
  const integration = workspacePaneIntegrationPlan[kind];
  return (
    <div
      className="h-full min-h-0 bg-zinc-900"
      data-pane-host={integration.host}
      data-pane-runtime={integration.runtime}
    />
  );
}

function workspacePaneIcon(kind: WorkspacePaneKind, className: string) {
  switch (kind) {
    case "browser":
      return <Globe2 className={className} />;
    case "canvas":
      return <PanelTop className={className} />;
    case "diffs":
      return <GitCompareArrows className={className} />;
    case "file":
      return <FileText className={className} />;
    case "settings":
      return <Settings className={className} />;
    case "terminal":
      return <Terminal className={className} />;
    default:
      return assertWorkspacePaneKind(kind);
  }
}

function assertWorkspacePaneKind(value: never): never {
  throw new Error(`Unhandled workspace pane kind: ${value}`);
}
