import type { WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import {
  FolderOpen,
  LayoutGrid,
  MessageSquarePlus,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel, type ChatView, useChatViewState } from "./components/chat-panel";
import { ResizablePane } from "./components/resizable-pane";
import { SettingsPanel } from "./components/settings-panel";
import {
  maxWorkspacePaneCount,
  canSplitWorkspacePaneTab,
  WorkspacePanePanel,
  type WorkspacePaneKind,
  type WorkspacePaneLayout,
  type WorkspacePaneSplitTarget,
  type WorkspacePaneState,
  type WorkspacePaneTab,
  type WorkspacePaneTabDragPayload,
  useWorkspacePaneState,
} from "./components/workspace-pane";
import {
  WorkspacePaneSplitDropOverlay,
  workspacePaneSplitTargetFromPoint,
} from "./components/workspace-pane-split-overlay";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import {
  type WorkspaceOperationKind,
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";
import { useChatStore } from "./stores/chat-store";

export function App() {
  const setta = readSettaApi();
  if (!setta) {
    return <AppRuntimeContractError />;
  }
  return <SettaApp setta={setta} />;
}

function SettaApp({ setta }: { setta: SettaAPI }) {
  const workspace = useWorkspaceViewState();
  const chat = useChatViewState(workspace.selectedWorkspace?.id ?? null);
  const panes = useWorkspacePaneState();
  const platform = setta.app.platform;
  useBackendResyncStatus(setta);
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const [projectPaneWidth, setProjectPaneWidth] = useState(220);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const [workspaceColumnPercent, setWorkspaceColumnPercent] = useState(50);
  const [workspaceRowPercent, setWorkspaceRowPercent] = useState(50);
  const [chatSearchOpenByPaneId, setChatSearchOpenByPaneId] = useState<Record<string, boolean>>({});
  const openChatSearch = useCallback(() => {
    const chatPane = firstWorkspacePaneWithKind(panes.panes, "chat");
    if (!chatPane) {
      panes.openTabKind("chat");
      return;
    }
    setChatSearchOpenByPaneId((current) => ({ ...current, [chatPane.id]: true }));
  }, [panes]);
  const openSettingsPane = useCallback(() => {
    panes.openTabKind("settings");
    setMaximizedPaneId(null);
  }, [panes]);
  const toggleMaximizedPane = useCallback((paneId: string) => {
    setProjectPaneOpen(true);
    setMaximizedPaneId((current) => (current === paneId ? null : paneId));
  }, []);
  useEffect(() => {
    return setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, [setta]);

  useEffect(() => {
    if (maximizedPaneId === null || panes.panes.some((pane) => pane.id === maximizedPaneId)) {
      return;
    }
    setMaximizedPaneId(null);
  }, [maximizedPaneId, panes.panes]);

  return (
    <div className="fixed inset-0 min-h-0 overflow-hidden bg-zinc-900 text-zinc-950">
      <AppChromeControls
        canCreatePane={panes.canCreatePane}
        createPane={panes.createPane}
        createConversation={chat.createConversation}
        openChatSearch={openChatSearch}
        paneCount={panes.panes.length}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        setProjectPaneOpen={(open) => {
          if (!open) {
            setMaximizedPaneId(null);
          }
          setProjectPaneOpen(open);
        }}
      />
      <main className="flex h-full min-h-0 min-w-0 overflow-hidden bg-zinc-900">
        <ProjectPane
          chromeInsetTop={projectPaneOpen}
          chat={chat}
          open={projectPaneOpen}
          openSettingsPane={openSettingsPane}
          setWidth={setProjectPaneWidth}
          width={projectPaneWidth}
          workspace={workspace}
        />
        <WorkspaceArea
          chat={chat}
          chatSearchOpenByPaneId={chatSearchOpenByPaneId}
          closePane={panes.closePane}
          closeTab={panes.closeTab}
          createTab={panes.createTab}
          maximizedPaneId={maximizedPaneId}
          panes={panes}
          platform={platform}
          projectPaneOpen={projectPaneOpen}
          selectTab={panes.selectTab}
          setMaximizedPaneId={setMaximizedPaneId}
          setChatSearchOpenByPaneId={setChatSearchOpenByPaneId}
          toggleMaximizedPane={toggleMaximizedPane}
          workspaceColumnPercent={workspaceColumnPercent}
          workspaceRowPercent={workspaceRowPercent}
          setWorkspaceColumnPercent={setWorkspaceColumnPercent}
          setWorkspaceRowPercent={setWorkspaceRowPercent}
          workspace={workspace}
        />
      </main>
    </div>
  );
}

function readSettaApi(): SettaAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & { setta?: SettaAPI }).setta ?? null;
}

function AppRuntimeContractError() {
  return (
    <div className="fixed inset-0 flex min-h-0 items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div
        className="max-w-md rounded-lg border border-red-500/30 bg-red-950/30 p-5 shadow-2xl"
        data-testid="app-runtime-contract-error"
        role="alert"
      >
        <div className="text-sm font-semibold text-red-200">Setta preload API is unavailable.</div>
        <p className="mt-2 text-sm leading-6 text-red-100/80">
          The renderer cannot start because the required Electron contract{" "}
          <code className="rounded bg-red-950/80 px-1.5 py-0.5 text-red-100">window.setta</code> is
          missing. Start Setta through the Electron desktop shell so the preload script can install
          the production API.
        </p>
      </div>
    </div>
  );
}

function useBackendResyncStatus(setta: SettaAPI) {
  useEffect(() => {
    return setta.backend.onEventStreamStatus((eventStream) => {
      if (eventStream.status === "resyncing") {
        void useChatStore.getState().resyncActiveConversation();
      }
    });
  }, [setta]);
}

function WorkspaceArea({
  chat,
  chatSearchOpenByPaneId,
  closePane,
  closeTab,
  createTab,
  maximizedPaneId,
  panes,
  platform,
  projectPaneOpen,
  selectTab,
  setMaximizedPaneId,
  setChatSearchOpenByPaneId,
  setWorkspaceColumnPercent,
  setWorkspaceRowPercent,
  toggleMaximizedPane,
  workspaceColumnPercent,
  workspaceRowPercent,
  workspace,
}: {
  chat: ChatView;
  chatSearchOpenByPaneId: Record<string, boolean>;
  closePane: (paneId: string) => void;
  closeTab: (paneId: string, tabId: string) => void;
  createTab: (paneId: string, kind: WorkspacePaneKind) => void;
  maximizedPaneId: string | null;
  panes: ReturnType<typeof useWorkspacePaneState>;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  selectTab: (paneId: string, tabId: string) => void;
  setMaximizedPaneId: Dispatch<SetStateAction<string | null>>;
  setChatSearchOpenByPaneId: Dispatch<SetStateAction<Record<string, boolean>>>;
  setWorkspaceColumnPercent: Dispatch<SetStateAction<number>>;
  setWorkspaceRowPercent: Dispatch<SetStateAction<number>>;
  toggleMaximizedPane: (paneId: string) => void;
  workspaceColumnPercent: number;
  workspaceRowPercent: number;
  workspace: WorkspaceViewState;
}) {
  const [draggingPaneTab, setDraggingPaneTab] = useState<WorkspacePaneTabDragPayload | null>(null);
  const [draggingPaneTarget, setDraggingPaneTarget] = useState<WorkspacePaneSplitTarget | null>(
    null,
  );
  const visiblePanes = workspaceGridVisiblePanes(panes.panes, maximizedPaneId);
  const splitAllowed = draggingPaneTab
    ? canSplitWorkspacePaneTab(panes.panes, draggingPaneTab.sourcePaneId)
    : false;
  const finishPaneTabDrag = useCallback(() => {
    setDraggingPaneTab(null);
    setDraggingPaneTarget(null);
  }, []);
  const splitTabIntoTarget = useCallback(
    (payload: WorkspacePaneTabDragPayload, target: WorkspacePaneSplitTarget) => {
      panes.splitTab(payload.sourcePaneId, payload.tabId, target);
      setMaximizedPaneId(null);
      finishPaneTabDrag();
    },
    [finishPaneTabDrag, panes, setMaximizedPaneId],
  );
  const gridRef = useWorkspacePaneGridResize({
    columnPercent: workspaceColumnPercent,
    rowPercent: workspaceRowPercent,
    setColumnPercent: setWorkspaceColumnPercent,
    setRowPercent: setWorkspaceRowPercent,
  });
  const handlePaneTabPointerDown = useCallback(
    (payload: WorkspacePaneTabDragPayload, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !gridRef.current) {
        return;
      }
      const grid = gridRef.current;
      const startX = event.clientX;
      const startY = event.clientY;
      const bodyUserSelect = document.body.style.userSelect;
      let dragging = false;
      let latestTarget: WorkspacePaneSplitTarget | null = null;
      const updateTarget = (clientX: number, clientY: number) => {
        const target = workspacePaneSplitTargetFromPoint(
          clientX,
          clientY,
          grid.getBoundingClientRect(),
        );
        latestTarget = target;
        setDraggingPaneTarget(target);
        return target;
      };
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!dragging && distance < 6) {
          return;
        }
        if (!dragging) {
          dragging = true;
          document.body.style.userSelect = "none";
          setDraggingPaneTab(payload);
        }
        updateTarget(moveEvent.clientX, moveEvent.clientY);
        moveEvent.preventDefault();
      };
      const handleMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = bodyUserSelect;
        if (!dragging) {
          finishPaneTabDrag();
          return;
        }
        const target = updateTarget(upEvent.clientX, upEvent.clientY) ?? latestTarget;
        if (target && canSplitWorkspacePaneTab(panes.panes, payload.sourcePaneId)) {
          splitTabIntoTarget(payload, target);
          return;
        }
        finishPaneTabDrag();
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [finishPaneTabDrag, gridRef, panes.panes, splitTabIntoTarget],
  );

  return (
    <div
      className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-zinc-900"
      data-pane-count={panes.panes.length}
      data-testid="workspace-pane-grid-shell"
    >
      <div
        className="grid h-full min-h-0 min-w-0 overflow-hidden bg-zinc-800"
        data-testid="workspace-pane-grid"
        ref={gridRef}
        style={workspacePaneGridStyle(
          panes.layout,
          visiblePanes.length,
          workspaceColumnPercent,
          workspaceRowPercent,
        )}
      >
        {visiblePanes.map((pane, index) => (
          <div
            className="min-h-0 min-w-0 overflow-hidden bg-zinc-950"
            data-pane-id={pane.id}
            data-testid="workspace-pane-grid-cell"
            key={pane.id}
            style={workspacePaneGridCellStyle(panes.layout, visiblePanes.length, index)}
          >
            <WorkspacePanePanel
              activeTabId={pane.activeTabId}
              avoidShellLeftControls={
                !projectPaneOpen &&
                workspacePaneTouchesShellLeft(panes.layout, visiblePanes.length, index)
              }
              avoidShellRightControls={workspacePaneTouchesShellRight(
                panes.layout,
                visiblePanes.length,
                index,
              )}
              canClosePane={panes.panes.length > 1}
              inShellTopBar={workspacePaneIsTopRow(panes.layout, visiblePanes.length, index)}
              initialNewTabMenuOpen={false}
              maximized={maximizedPaneId === pane.id}
              onClosePane={() => closePane(pane.id)}
              onCloseTab={(tabId) => closeTab(pane.id, tabId)}
              onCreateTab={(kind) => createTab(pane.id, kind)}
              onSelectTab={(tabId) => selectTab(pane.id, tabId)}
              onTabPointerDown={handlePaneTabPointerDown}
              onToggleMaximize={() => toggleMaximizedPane(pane.id)}
              paneId={pane.id}
              renderTabContent={(tab) => (
                <WorkspacePaneTabContent
                  chat={chat}
                  pane={pane}
                  searchOpen={chatSearchOpenByPaneId[pane.id] ?? false}
                  setSearchOpen={(open) =>
                    setChatSearchOpenByPaneId((current) => ({
                      ...current,
                      [pane.id]: open,
                    }))
                  }
                  tab={tab}
                  workspace={workspace}
                />
              )}
              shellLeftInsetClass={shellLeftControlsPaddingClass(platform)}
              shellRightInsetClass={shellRightControlsPaddingClass(platform)}
              showNewTabButton
              slot="grid"
              tabs={pane.tabs}
            />
          </div>
        ))}
        <WorkspacePaneGridResizers
          columnPercent={workspaceColumnPercent}
          layout={panes.layout}
          paneCount={visiblePanes.length}
          rowPercent={workspaceRowPercent}
          setColumnPercent={setWorkspaceColumnPercent}
          setRowPercent={setWorkspaceRowPercent}
        />
      </div>
      <WorkspacePaneSplitDropOverlay
        activeTarget={draggingPaneTarget}
        canSplit={splitAllowed}
        draggingTab={draggingPaneTab}
        layout={panes.layout}
        paneCount={visiblePanes.length}
      />
    </div>
  );
}

function WorkspacePaneTabContent({
  chat,
  pane,
  searchOpen,
  setSearchOpen,
  tab,
  workspace,
}: {
  chat: ChatView;
  pane: WorkspacePaneState;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  tab: WorkspacePaneTab;
  workspace: WorkspaceViewState;
}) {
  switch (tab.kind) {
    case "chat":
      return (
        <div
          className="h-full min-h-0 bg-zinc-900"
          data-pane-kind="chat"
          data-testid="chat-pane-surface"
        >
          <ChatPanel
            avoidShellControls={false}
            chat={chat}
            maximized={false}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            workspace={workspace.selectedWorkspace}
          />
        </div>
      );
    case "settings":
      return <WorkspacePaneSettingsSurface paneId={pane.id} tabId={tab.id} />;
    default:
      return assertWorkspacePaneKind(tab.kind);
  }
}

function WorkspacePaneSettingsSurface({ paneId, tabId }: { paneId: string; tabId: string }) {
  return (
    <div
      className="h-full min-h-0"
      data-pane-id={paneId}
      data-pane-kind="settings"
      data-tab-id={tabId}
      data-testid="settings-pane-surface"
    >
      <SettingsPanel />
    </div>
  );
}

function workspaceGridVisiblePanes(panes: WorkspacePaneState[], maximizedPaneId: string | null) {
  if (maximizedPaneId === null) {
    return panes;
  }
  return panes.filter((pane) => pane.id === maximizedPaneId);
}

function workspacePaneGridStyle(
  layout: WorkspacePaneLayout,
  count: number,
  columnPercent: number,
  rowPercent: number,
): CSSProperties {
  if (count <= 1) {
    return {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "minmax(0, 1fr)",
    };
  }
  if (layout === "columns") {
    return {
      gridTemplateColumns: `${columnPercent}% 1px ${100 - columnPercent}%`,
      gridTemplateRows: "minmax(0, 1fr)",
    };
  }
  if (layout === "rows") {
    return {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: `${rowPercent}% 1px ${100 - rowPercent}%`,
    };
  }
  return {
    gridTemplateColumns: `${columnPercent}% 1px ${100 - columnPercent}%`,
    gridTemplateRows: `${rowPercent}% 1px ${100 - rowPercent}%`,
  };
}

const workspacePaneGridCellStyles = {
  "bottom-split": [
    { gridColumn: "1 / 4", gridRow: "1" },
    { gridColumn: "1", gridRow: "3" },
    { gridColumn: "3", gridRow: "3" },
  ],
  columns: [
    { gridColumn: "1", gridRow: "1" },
    { gridColumn: "3", gridRow: "1" },
  ],
  grid: [
    { gridColumn: "1", gridRow: "1" },
    { gridColumn: "3", gridRow: "1" },
    { gridColumn: "1", gridRow: "3" },
    { gridColumn: "3", gridRow: "3" },
  ],
  "left-split": [
    { gridColumn: "1", gridRow: "1" },
    { gridColumn: "1", gridRow: "3" },
    { gridColumn: "3", gridRow: "1 / 4" },
  ],
  "right-split": [
    { gridColumn: "1", gridRow: "1 / 4" },
    { gridColumn: "3", gridRow: "1" },
    { gridColumn: "3", gridRow: "3" },
  ],
  rows: [
    { gridColumn: "1", gridRow: "1" },
    { gridColumn: "1", gridRow: "3" },
  ],
  "top-split": [
    { gridColumn: "1", gridRow: "1" },
    { gridColumn: "3", gridRow: "1" },
    { gridColumn: "1 / 4", gridRow: "3" },
  ],
} satisfies Record<WorkspacePaneLayout, CSSProperties[]>;

const workspacePaneTopRowIndices = {
  "bottom-split": [0],
  columns: [0, 1],
  grid: [0, 1],
  "left-split": [0, 2],
  "right-split": [0, 1],
  rows: [0],
  "top-split": [0, 1],
} satisfies Record<WorkspacePaneLayout, number[]>;

const workspacePaneShellLeftIndices = {
  "bottom-split": [0],
  columns: [0],
  grid: [0],
  "left-split": [0],
  "right-split": [0],
  rows: [0],
  "top-split": [0],
} satisfies Record<WorkspacePaneLayout, number[]>;

const workspacePaneShellRightIndices = {
  "bottom-split": [0],
  columns: [1],
  grid: [1],
  "left-split": [2],
  "right-split": [1],
  rows: [0],
  "top-split": [1],
} satisfies Record<WorkspacePaneLayout, number[]>;

function workspacePaneGridCellStyle(
  layout: WorkspacePaneLayout,
  count: number,
  index: number,
): CSSProperties {
  if (count <= 1) {
    return { gridColumn: "1", gridRow: "1" };
  }
  return (
    workspacePaneGridCellStyles[layout][index] ??
    workspacePaneGridCellStyles.grid[index] ?? { gridColumn: "1", gridRow: "1" }
  );
}

function workspacePaneIsTopRow(layout: WorkspacePaneLayout, count: number, index: number) {
  if (count <= 1) {
    return true;
  }
  return workspacePaneTopRowIndices[layout].includes(index);
}

function workspacePaneTouchesShellLeft(layout: WorkspacePaneLayout, count: number, index: number) {
  if (!workspacePaneIsTopRow(layout, count, index)) {
    return false;
  }
  return count <= 1 || workspacePaneShellLeftIndices[layout].includes(index);
}

function workspacePaneTouchesShellRight(layout: WorkspacePaneLayout, count: number, index: number) {
  if (!workspacePaneIsTopRow(layout, count, index)) {
    return false;
  }
  return count <= 1 || workspacePaneShellRightIndices[layout].includes(index);
}

function firstWorkspacePaneWithKind(panes: WorkspacePaneState[], kind: WorkspacePaneKind) {
  return panes.find((pane) => pane.tabs.some((tab) => tab.kind === kind)) ?? null;
}

function shellLeftControlsPaddingClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "pl-28" : "pl-12";
}

function shellRightControlsPaddingClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "pr-44" : "pr-40";
}

function useWorkspacePaneGridResize({
  columnPercent,
  rowPercent,
  setColumnPercent,
  setRowPercent,
}: {
  columnPercent: number;
  rowPercent: number;
  setColumnPercent: Dispatch<SetStateAction<number>>;
  setRowPercent: Dispatch<SetStateAction<number>>;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    gridRef.current?.style.setProperty("--workspace-column-percent", `${columnPercent}`);
    gridRef.current?.style.setProperty("--workspace-row-percent", `${rowPercent}`);
  }, [columnPercent, gridRef, rowPercent]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    const startResize = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const axis = target.dataset.resizeAxis;
      if (axis !== "column" && axis !== "row") {
        return;
      }
      const rect = grid.getBoundingClientRect();
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      const update = (moveEvent: PointerEvent) => {
        if (axis === "column") {
          setColumnPercent(clampRatio(((moveEvent.clientX - rect.left) / rect.width) * 100));
        } else {
          setRowPercent(clampRatio(((moveEvent.clientY - rect.top) / rect.height) * 100));
        }
      };
      const stopResize = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", update);
      };
      event.preventDefault();
      document.body.style.cursor = axis === "column" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", update);
      window.addEventListener("pointerup", stopResize, { once: true });
    };
    grid.addEventListener("pointerdown", startResize);
    return () => {
      grid.removeEventListener("pointerdown", startResize);
    };
  }, [gridRef, setColumnPercent, setRowPercent]);
  return gridRef;
}

function WorkspacePaneGridResizers({
  columnPercent,
  layout,
  paneCount,
  rowPercent,
  setColumnPercent,
  setRowPercent,
}: {
  columnPercent: number;
  layout: WorkspacePaneLayout;
  paneCount: number;
  rowPercent: number;
  setColumnPercent: Dispatch<SetStateAction<number>>;
  setRowPercent: Dispatch<SetStateAction<number>>;
}) {
  if (paneCount <= 1) {
    return null;
  }
  const showColumn = layout !== "rows";
  const showRow = layout !== "columns";
  return (
    <>
      {showColumn ? (
        <WorkspacePaneGridResizeHandle
          axis="column"
          layout={layout}
          onKeyStep={(step) => setColumnPercent((current) => clampRatio(current + step))}
          value={columnPercent}
        />
      ) : null}
      {showRow ? (
        <WorkspacePaneGridResizeHandle
          axis="row"
          layout={layout}
          onKeyStep={(step) => setRowPercent((current) => clampRatio(current + step))}
          value={rowPercent}
        />
      ) : null}
    </>
  );
}

function WorkspacePaneGridResizeHandle({
  axis,
  layout,
  onKeyStep,
  value,
}: {
  axis: "column" | "row";
  layout: WorkspacePaneLayout;
  onKeyStep: (step: number) => void;
  value: number;
}) {
  const isColumn = axis === "column";
  return (
    <div
      aria-label={isColumn ? "Resize workspace columns" : "Resize workspace rows"}
      aria-orientation={isColumn ? "vertical" : "horizontal"}
      aria-valuemax={75}
      aria-valuemin={25}
      aria-valuenow={Math.round(value)}
      className={cn(
        "relative z-50 bg-zinc-800 outline-none transition-colors hover:bg-zinc-700 focus-visible:bg-zinc-600",
        isColumn ? "cursor-col-resize" : "cursor-row-resize",
      )}
      data-resize-axis={axis}
      onKeyDown={(event) => {
        const negativeKey = isColumn ? "ArrowLeft" : "ArrowUp";
        const positiveKey = isColumn ? "ArrowRight" : "ArrowDown";
        if (event.key === negativeKey) {
          event.preventDefault();
          onKeyStep(-4);
        }
        if (event.key === positiveKey) {
          event.preventDefault();
          onKeyStep(4);
        }
      }}
      role="separator"
      style={workspacePaneResizeHandleStyle(layout, axis)}
      tabIndex={0}
    />
  );
}

function workspacePaneResizeHandleStyle(
  layout: WorkspacePaneLayout,
  axis: "column" | "row",
): CSSProperties {
  return workspacePaneResizeHandleStyles[axis][layout];
}

const workspacePaneResizeHandleStyles = {
  column: {
    "bottom-split": { gridColumn: "2", gridRow: "3" },
    columns: { gridColumn: "2", gridRow: "1 / -1" },
    grid: { gridColumn: "2", gridRow: "1 / -1" },
    "left-split": { gridColumn: "2", gridRow: "1 / -1" },
    "right-split": { gridColumn: "2", gridRow: "1 / -1" },
    rows: { gridColumn: "1", gridRow: "1 / -1" },
    "top-split": { gridColumn: "2", gridRow: "1" },
  },
  row: {
    "bottom-split": { gridColumn: "1 / -1", gridRow: "2" },
    columns: { gridColumn: "1 / -1", gridRow: "1" },
    grid: { gridColumn: "1 / -1", gridRow: "2" },
    "left-split": { gridColumn: "1", gridRow: "2" },
    "right-split": { gridColumn: "3", gridRow: "2" },
    rows: { gridColumn: "1", gridRow: "2" },
    "top-split": { gridColumn: "1 / -1", gridRow: "2" },
  },
} satisfies Record<"column" | "row", Record<WorkspacePaneLayout, CSSProperties>>;

function clampRatio(value: number) {
  return Math.min(75, Math.max(25, value));
}

function assertWorkspacePaneKind(value: never): never {
  throw new Error(`Unhandled workspace pane kind: ${value}`);
}

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;

function ProjectPane({
  chromeInsetTop,
  chat,
  open,
  openSettingsPane,
  setWidth,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  chat: ChatView;
  open: boolean;
  openSettingsPane: () => void;
  setWidth: (width: number) => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  return (
    <ResizablePane
      label="Resize project sidebar"
      maxWidth={320}
      minWidth={176}
      onWidthChange={setWidth}
      width={width}
    >
      <div className="h-full">
        <WorkspaceSidebar
          activeRun={chat.activeRun}
          activeWorkspaces={workspace.activeWorkspaces}
          busy={workspace.busy || chat.operation !== null}
          chatBusy={chat.operation !== null || chat.status === "loading"}
          closeWorkspace={workspace.closeWorkspace}
          conversations={chat.conversations}
          corruption={chat.corruption}
          createConversation={chat.createConversation}
          createWorkspaceConversation={chat.createWorkspaceConversation}
          deleteConversation={chat.deleteConversation}
          diagnostics={chat.diagnostics}
          openLocalFolder={workspace.openLocalFolder}
          openSettingsPane={openSettingsPane}
          recentWorkspaces={workspace.recentWorkspaces}
          removeRecent={workspace.removeRecent}
          selectConversation={chat.selectConversation}
          selectWorkspace={workspace.selectWorkspace}
          selectedConversationId={chat.selectedConversation?.id ?? ""}
          selectedWorkspaceId={workspace.selectedWorkspaceId}
          chromeInsetTop={chromeInsetTop}
          sidebarWidth={width}
          unreadConversationIds={chat.unreadConversationIds}
        />
      </div>
    </ResizablePane>
  );
}

function AppChromeControls({
  canCreatePane,
  createPane,
  createConversation,
  openChatSearch,
  paneCount,
  platform,
  projectPaneOpen,
  setProjectPaneOpen,
}: {
  canCreatePane: boolean;
  createPane: (kind: WorkspacePaneKind) => void;
  createConversation: (title?: string) => Promise<void>;
  openChatSearch: () => void;
  paneCount: number;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  setProjectPaneOpen: (open: boolean) => void;
}) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isModShortcut(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        openChatSearch();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        void createConversation();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [createConversation, openChatSearch]);

  return (
    <>
      <ShellTopBar />
      <FloatingProjectPaneControl
        active={projectPaneOpen}
        platform={platform}
        setProjectPaneOpen={setProjectPaneOpen}
      />
      <FloatingPaneControls
        canCreatePane={canCreatePane}
        createPane={createPane}
        openChatSearch={openChatSearch}
        paneCount={paneCount}
        platform={platform}
      />
    </>
  );
}

function FloatingProjectPaneControl({
  active,
  platform,
  setProjectPaneOpen,
}: {
  active: boolean;
  platform: DesktopPlatform;
  setProjectPaneOpen: (open: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "app-no-drag fixed top-1 z-50 text-zinc-500",
        floatingProjectControlLeftInsetClass(platform),
      )}
    >
      <ShellPaneToggle
        active={active}
        label={active ? "Hide project sidebar" : "Show project sidebar"}
        onClick={() => setProjectPaneOpen(!active)}
      >
        <PanelLeftOpen className="h-3.5 w-3.5" />
      </ShellPaneToggle>
    </div>
  );
}

function ShellTopBar() {
  return (
    <div
      aria-hidden="true"
      className="app-drag pointer-events-auto fixed inset-x-0 top-0 z-30 h-10 bg-transparent"
      data-testid="shell-top-bar"
    />
  );
}

function isModShortcut(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
}

function ShellPaneToggle({
  active,
  children,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-300 outline-none hover:bg-zinc-800/80 focus-visible:bg-zinc-800/80"
          : "inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-600 outline-none hover:bg-zinc-800/80 hover:text-zinc-300 focus-visible:bg-zinc-800/80 focus-visible:text-zinc-300"
      }
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function FloatingPaneControls({
  canCreatePane,
  createPane,
  openChatSearch,
  paneCount,
  platform,
}: {
  canCreatePane: boolean;
  createPane: (kind: WorkspacePaneKind) => void;
  openChatSearch: () => void;
  paneCount: number;
  platform: DesktopPlatform;
}) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none fixed top-1 z-50 flex items-center gap-1 text-zinc-500",
        floatingControlsRightInsetClass(platform),
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1">
        <ShellPaneToggle active={false} label="Search chat panes" onClick={openChatSearch}>
          <Search className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={false}
          disabled={!canCreatePane}
          label="Add chat pane"
          onClick={() => createPane("chat")}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={false}
          disabled={!canCreatePane}
          label="Add settings pane"
          onClick={() => createPane("settings")}
        >
          <Settings className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <div
          aria-label={`${paneCount} of ${maxWorkspacePaneCount} panes open`}
          className="grid h-7 min-w-7 place-items-center rounded-sm px-1.5 text-[11px] font-semibold text-zinc-600"
          title={`${paneCount}/${maxWorkspacePaneCount} panes`}
        >
          <span className="inline-flex items-center gap-1">
            <LayoutGrid className="h-3.5 w-3.5" />
            {paneCount}/{maxWorkspacePaneCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function floatingControlsRightInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "right-2" : "right-36";
}

function floatingProjectControlLeftInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "left-[74px]" : "left-2";
}

function useWorkspaceViewState() {
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const error = useWorkspaceStore((state) => state.error);
  const loadSession = useWorkspaceStore((state) => state.loadSession);
  const openLocalFolder = useWorkspaceStore((state) => state.openLocalFolder);
  const operation = useWorkspaceStore((state) => state.operation);
  const removeRecent = useWorkspaceStore((state) => state.removeRecent);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const session = useWorkspaceStore((state) => state.session);
  const status = useWorkspaceStore((state) => state.status);
  const selectedWorkspace = useSelectedWorkspace(session);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return {
    activeWorkspaces: session?.activeWorkspaces ?? [],
    busy: operation !== null || status === "loading",
    closeWorkspace,
    error,
    openLocalFolder,
    operation,
    recentWorkspaces: session?.recentWorkspaces ?? [],
    removeRecent,
    selectWorkspace,
    selectedWorkspace,
    selectedWorkspaceId: session?.selectedWorkspaceId ?? "",
    status,
  };
}

function useSelectedWorkspace(session: WorkspaceSession | null) {
  return useMemo(() => {
    return (
      session?.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
}

export function WorkspacePanel({
  error,
  openLocalFolder,
  operation,
  selectedWorkspace,
  status,
}: {
  error: string | null;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  selectedWorkspace: WorkspaceSummary | null;
  status: WorkspaceStatus;
}) {
  const busy = operation !== null || status === "loading";
  return (
    <div id="workspace" className="border-b border-zinc-200 bg-white p-2">
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-zinc-950">Workspace</h2>
            {status === "loading" ? <Badge variant="neutral">Loading</Badge> : null}
            {operation ? <Badge variant="neutral">{operationLabel(operation)}</Badge> : null}
          </div>
          {selectedWorkspace ? (
            <div className="mt-3 min-w-0">
              <div className="truncate text-xs font-semibold">{selectedWorkspace.displayName}</div>
              <div
                className="mt-1 truncate text-xs text-zinc-500"
                data-testid="selected-workspace-path"
              >
                {selectedWorkspace.rootPath}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-xs font-semibold">No workspace open</div>
              <Button
                className="mt-2 h-7 rounded-sm px-2 text-xs"
                disabled={busy}
                onClick={() => void openLocalFolder()}
                variant="primary"
              >
                <FolderOpen className="h-4 w-4" />
                Open Folder
              </Button>
            </div>
          )}
          {error ? (
            <div
              className="mt-2 max-w-3xl rounded-sm border border-zinc-400 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-950"
              data-testid="workspace-error"
            >
              {error}
            </div>
          ) : null}
        </div>
        <Badge variant={selectedWorkspace ? "success" : "neutral"}>
          {selectedWorkspace ? "Active" : "Empty"}
        </Badge>
      </div>
    </div>
  );
}

const operationLabels = {
  closing: "Closing",
  opening: "Opening",
  removingRecent: "Removing",
  reordering: "Reordering",
  selecting: "Selecting",
} satisfies Record<WorkspaceOperationKind, string>;

function operationLabel(operation: WorkspaceOperationKind) {
  return operationLabels[operation];
}
