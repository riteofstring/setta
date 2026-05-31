import { FileText, GitCompareArrows, Globe2, PanelTop, Settings, Terminal, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

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
  onCloseTab,
  onCreateTab,
  onSelectTab,
  slot,
  tabs,
}: {
  activeTabId: string;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = slot === "right" ? "Right pane" : "Bottom pane";
  return (
    <section
      aria-label={paneLabel}
      className={
        slot === "right"
          ? "flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100"
          : "flex h-72 min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100"
      }
      data-testid={`${slot}-workspace-pane`}
    >
      <header className="app-no-drag flex h-9 shrink-0 items-center gap-1 border-b border-zinc-800 px-2">
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
          </nav>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{paneLabel}</span>
        )}
        {tabs.length > 0 ? (
          <div className="flex items-center gap-1">
            {workspacePaneActions.map((kind) => (
              <WorkspacePaneActionButton
                key={kind}
                kind={kind}
                onClick={() => onCreateTab(kind)}
                showLabel={false}
              />
            ))}
          </div>
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
      className={
        active
          ? "group flex h-7 min-w-0 max-w-40 items-center gap-1 rounded-md bg-zinc-800 px-2 text-xs text-zinc-100"
          : "group flex h-7 min-w-0 max-w-40 items-center gap-1 rounded-md px-2 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
      }
      data-testid={`workspace-pane-tab-${tab.id}`}
    >
      {workspacePaneIcon(tab.kind, "h-3.5 w-3.5 shrink-0")}
      <button className="min-w-0 truncate" onClick={onSelect} type="button">
        {tab.title}
      </button>
      <button
        aria-label={`Close ${tab.title}`}
        className="ml-1 hidden h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 group-hover:inline-flex"
        onClick={onClose}
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
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
          ? "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          : "inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
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
  return (
    <WorkspacePaneRuntimeFrame
      icon={<Globe2 className="h-3.5 w-3.5" />}
      kind="browser"
      label="Browser"
    />
  );
}

function CanvasPaneSurface() {
  return (
    <WorkspacePaneRuntimeFrame
      icon={<PanelTop className="h-3.5 w-3.5" />}
      kind="canvas"
      label="Canvas"
    />
  );
}

function DiffsPaneSurface() {
  return (
    <WorkspacePaneRuntimeFrame
      icon={<GitCompareArrows className="h-3.5 w-3.5" />}
      kind="diffs"
      label="Diffs"
    />
  );
}

function FilesPaneSurface() {
  return (
    <WorkspacePaneRuntimeFrame
      icon={<FileText className="h-3.5 w-3.5" />}
      kind="file"
      label="Files"
    />
  );
}

function TerminalPaneSurface() {
  const integration = workspacePaneIntegrationPlan.terminal;
  return (
    <div
      className="h-full bg-zinc-950 p-3 font-mono text-xs text-zinc-500"
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
  icon,
  kind,
  label,
}: {
  icon: ReactNode;
  kind: Exclude<WorkspacePaneKind, "settings" | "terminal">;
  label: string;
}) {
  const integration = workspacePaneIntegrationPlan[kind];
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-zinc-900"
      data-pane-host={integration.host}
      data-pane-runtime={integration.runtime}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-xs text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
    </div>
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
