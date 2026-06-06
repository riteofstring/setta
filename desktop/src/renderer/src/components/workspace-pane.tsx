import { Maximize2, Minimize2, Plus, Settings, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { FloatingMenu } from "./floating-menu";
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

const workspacePaneActions = ["settings"] satisfies WorkspacePaneKind[];

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
  chromeInsetTop = false,
  initialNewTabMenuOpen = false,
  maximized = false,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  onToggleMaximize,
  showNewTabButton = true,
  slot,
  tabs,
}: {
  activeTabId: string;
  chromeInsetTop?: boolean;
  initialNewTabMenuOpen?: boolean;
  maximized?: boolean;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  onToggleMaximize?: () => void;
  showNewTabButton?: boolean;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = slot === "right" ? "Workspace side pane" : "Workspace bottom pane";
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(initialNewTabMenuOpen);
  return (
    <section
      aria-label={paneLabel}
      className={workspacePanePanelClass(slot, chromeInsetTop)}
      data-testid={`${slot}-workspace-pane`}
    >
      <header
        className={workspacePaneHeaderClass(slot)}
        data-testid={`${slot}-workspace-pane-header`}
      >
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
            onCreateTab={(kind) => {
              setNewTabMenuOpen(false);
              onCreateTab(kind);
            }}
            onOpenChange={setNewTabMenuOpen}
            open={newTabMenuOpen}
            show={showNewTabButton}
          />
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
        {activeTab ? (
          <WorkspacePaneContent tab={activeTab} />
        ) : (
          <WorkspacePaneEmpty onCreateTab={() => onCreateTab("settings")} />
        )}
      </div>
    </section>
  );
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
  const paneName = slot === "bottom" ? "bottom" : "side";
  const label = maximized ? `Restore ${paneName} pane` : `Maximize ${paneName} pane`;
  return (
    <button
      aria-label={label}
      className="app-no-drag grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent/80 hover:text-muted-foreground focus-visible:bg-accent/80 focus-visible:text-muted-foreground"
      onClick={onToggleMaximize}
      title={label}
      type="button"
    >
      {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function workspacePanePanelClass(slot: PaneSlot, chromeInsetTop: boolean) {
  const slotClass =
    slot === "right"
      ? "flex h-full min-h-0 flex-col border-l border-border bg-popover text-foreground"
      : "flex h-full min-h-0 flex-col border-t border-border bg-popover text-foreground";
  return cn(slotClass, chromeInsetTop && "pt-10");
}

function workspacePaneHeaderClass(slot: PaneSlot) {
  return cn(
    "app-drag relative z-40 flex shrink-0 items-center gap-1 px-1.5",
    slot === "right" ? "h-10" : "h-8 border-b border-border",
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
        "app-no-drag group relative flex h-7 min-w-0 max-w-40 items-center rounded-sm border px-1.5 text-xs transition-colors max-[560px]:max-w-7",
        active
          ? "border-border/70 bg-muted/80 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-popover/80 hover:text-foreground",
      )}
      data-testid={`workspace-pane-tab-${tab.id}`}
    >
      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 truncate pr-1 text-left outline-none focus-visible:text-foreground focus-visible:underline focus-visible:decoration-ring focus-visible:underline-offset-2"
        onClick={onSelect}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <span className="relative grid h-4 w-4 shrink-0 place-items-center">
          {workspacePaneIcon(tab.kind, "h-3.5 w-3.5")}
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center rounded-sm bg-muted text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <X className="h-3 w-3 stroke-[2.5]" />
          </span>
        </span>
        <span className="min-w-0 truncate max-[560px]:hidden">{tab.title}</span>
      </button>
      <button
        aria-label={`Close ${tab.title}`}
        className="absolute top-1.5 left-1.5 z-10 grid h-4 w-4 cursor-pointer place-items-center rounded-sm text-foreground opacity-0 outline-none transition-opacity hover:bg-accent focus-visible:bg-accent focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
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
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-sm text-muted-foreground outline-none hover:bg-background hover:text-muted-foreground focus-visible:bg-background focus-visible:text-muted-foreground"
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
        className="w-36 rounded-sm border border-border bg-background py-1 shadow-xl shadow-black/35"
        menuRef={menuRef}
        open={open}
        placement="bottom"
        role="menu"
      >
        {workspacePaneActions.map((kind) => {
          const label = workspacePaneLabels[kind];
          return (
            <button
              className="flex h-6 w-full cursor-pointer items-center gap-2 px-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              key={kind}
              onClick={() => onCreateTab(kind)}
              onPointerDown={(event) => event.stopPropagation()}
              role="menuitem"
              type="button"
            >
              {workspacePaneIcon(kind, "h-3.5 w-3.5 shrink-0 text-muted-foreground")}
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </FloatingMenu>
    </div>
  );
}

function WorkspacePaneEmpty({ onCreateTab }: { onCreateTab: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-popover px-4">
      <button
        className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
        onClick={onCreateTab}
        type="button"
      >
        <Settings className="h-3.5 w-3.5 shrink-0" />
        <span>Settings</span>
      </button>
    </div>
  );
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
