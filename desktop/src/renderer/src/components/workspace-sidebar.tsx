import type { WorkspaceSummary } from "@generated/backend";
import { ArrowDown, ArrowUp, FolderOpen, Trash2, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

const activeWorkspaceRowHeight = 76;
const recentWorkspaceRowHeight = 60;
const workspaceListOverscan = 6;

interface WorkspaceSidebarProps {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedWorkspaceId: string;
}

interface VirtualRange {
  end: number;
  start: number;
}

interface VirtualWorkspaceListProps {
  itemTestId: string;
  items: WorkspaceSummary[];
  renderItem: (workspace: WorkspaceSummary, index: number) => ReactNode;
  rowHeight: number;
  testId: string;
}

export function WorkspaceSidebar({
  activeWorkspaces,
  busy,
  closeWorkspace,
  openLocalFolder,
  recentWorkspaces,
  removeRecent,
  reorderWorkspaces,
  selectWorkspace,
  selectedWorkspaceId,
}: WorkspaceSidebarProps) {
  const activeWorkspaceIds = useMemo(
    () => new Set(activeWorkspaces.map((workspace) => workspace.id)),
    [activeWorkspaces],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Workspaces</h2>
        <Button
          aria-label="Open workspace folder"
          className="h-8 px-2"
          disabled={busy}
          onClick={() => void openLocalFolder()}
          title="Open workspace folder"
        >
          <FolderOpen className="h-4 w-4" />
          Open
        </Button>
      </div>
      <div className="mt-5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 overflow-hidden">
        <WorkspaceList
          activeWorkspaces={activeWorkspaces}
          busy={busy}
          closeWorkspace={closeWorkspace}
          reorderWorkspaces={reorderWorkspaces}
          selectWorkspace={selectWorkspace}
          selectedWorkspaceId={selectedWorkspaceId}
        />
        <Separator />
        <RecentWorkspaceList
          activeWorkspaceIds={activeWorkspaceIds}
          busy={busy}
          recentWorkspaces={recentWorkspaces}
          removeRecent={removeRecent}
        />
      </div>
    </div>
  );
}

function WorkspaceList({
  activeWorkspaces,
  busy,
  closeWorkspace,
  reorderWorkspaces,
  selectWorkspace,
  selectedWorkspaceId,
}: {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedWorkspaceId: string;
}) {
  if (activeWorkspaces.length === 0) {
    return (
      <section className="min-h-0">
        <p className="text-sm text-zinc-500">No active workspaces</p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden" aria-label="Active workspaces">
      <VirtualWorkspaceList
        itemTestId="active-workspace-item"
        items={activeWorkspaces}
        renderItem={(workspace, index) => (
          <ActiveWorkspaceRow
            activeWorkspaces={activeWorkspaces}
            busy={busy}
            closeWorkspace={closeWorkspace}
            index={index}
            reorderWorkspaces={reorderWorkspaces}
            selectWorkspace={selectWorkspace}
            selected={workspace.id === selectedWorkspaceId}
            workspace={workspace}
          />
        )}
        rowHeight={activeWorkspaceRowHeight}
        testId="active-workspace-list"
      />
    </section>
  );
}

function ActiveWorkspaceRow({
  activeWorkspaces,
  busy,
  closeWorkspace,
  index,
  reorderWorkspaces,
  selectWorkspace,
  selected,
  workspace,
}: {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  index: number;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selected: boolean;
  workspace: WorkspaceSummary;
}) {
  return (
    <div
      className={cn(
        "grid h-[68px] grid-cols-[1fr_auto] gap-1 rounded-md border px-2 py-2",
        selected
          ? "border-zinc-300 bg-zinc-100"
          : "border-transparent bg-white hover:border-zinc-200",
      )}
    >
      <button
        className="min-w-0 text-left"
        data-testid="active-workspace-select"
        disabled={busy}
        onClick={() => void selectWorkspace(workspace.id)}
      >
        <span className="block truncate text-sm font-medium">{workspace.displayName}</span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">{workspace.rootPath}</span>
      </button>
      <div className="flex items-center gap-1">
        <IconButton
          disabled={busy || index === 0}
          label="Move workspace up"
          onClick={() => void moveWorkspace(activeWorkspaces, index, -1, reorderWorkspaces)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={busy || index === activeWorkspaces.length - 1}
          label="Move workspace down"
          onClick={() => void moveWorkspace(activeWorkspaces, index, 1, reorderWorkspaces)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={busy}
          label="Close workspace"
          onClick={() => void closeWorkspace(workspace.id)}
        >
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function RecentWorkspaceList({
  activeWorkspaceIds,
  busy,
  recentWorkspaces,
  removeRecent,
}: {
  activeWorkspaceIds: Set<string>;
  busy: boolean;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
}) {
  if (recentWorkspaces.length === 0) {
    return (
      <section className="min-h-0">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Recent</h3>
        <p className="mt-3 text-sm text-zinc-500">No recent workspaces</p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden" aria-label="Recent workspaces">
      <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Recent</h3>
      <VirtualWorkspaceList
        itemTestId="recent-workspace-item"
        items={recentWorkspaces}
        renderItem={(workspace) => (
          <RecentWorkspaceRow
            active={activeWorkspaceIds.has(workspace.id)}
            busy={busy}
            removeRecent={removeRecent}
            workspace={workspace}
          />
        )}
        rowHeight={recentWorkspaceRowHeight}
        testId="recent-workspace-list"
      />
    </section>
  );
}

function RecentWorkspaceRow({
  active,
  busy,
  removeRecent,
  workspace,
}: {
  active: boolean;
  busy: boolean;
  removeRecent: (id: string) => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="grid h-[52px] grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-800">{workspace.displayName}</div>
        <div className="truncate text-xs text-zinc-500">{workspace.rootPath}</div>
      </div>
      <IconButton
        disabled={busy || active}
        label="Remove recent workspace"
        onClick={() => void removeRecent(workspace.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

function VirtualWorkspaceList({
  itemTestId,
  items,
  renderItem,
  rowHeight,
  testId,
}: VirtualWorkspaceListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const range = virtualRange({
    itemCount: items.length,
    overscan: workspaceListOverscan,
    rowHeight,
    scrollTop,
    viewportHeight,
  });
  const visibleItems = items.slice(range.start, range.end);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const updateHeight = () => {
      setViewportHeight(viewport.clientHeight);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className="mt-3 min-h-0 flex-1 basis-0 overflow-y-auto"
      data-testid={testId}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <ul className="relative" style={virtualListStyle(items.length, rowHeight)}>
        {visibleItems.map((workspace, offset) => {
          const index = range.start + offset;
          return (
            <li
              className="absolute left-0 w-full"
              data-testid={itemTestId}
              key={workspace.id}
              style={virtualRowStyle(index, rowHeight)}
            >
              {renderItem(workspace, index)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function virtualRange({
  itemCount,
  overscan,
  rowHeight,
  scrollTop,
  viewportHeight,
}: {
  itemCount: number;
  overscan: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}): VirtualRange {
  if (itemCount === 0) {
    return { end: 0, start: 0 };
  }
  const visibleStart = Math.floor(scrollTop / rowHeight);
  const visibleEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(itemCount, Math.max(visibleEnd + overscan, start + 1));
  return { end, start };
}

function virtualListStyle(itemCount: number, rowHeight: number): CSSProperties {
  return { height: itemCount * rowHeight };
}

function virtualRowStyle(index: number, rowHeight: number): CSSProperties {
  return {
    height: rowHeight,
    transform: `translateY(${index * rowHeight}px)`,
  };
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function moveWorkspace(
  activeWorkspaces: WorkspaceSummary[],
  index: number,
  direction: -1 | 1,
  reorderWorkspaces: (ids: string[]) => Promise<void>,
) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= activeWorkspaces.length) {
    return;
  }
  const ids = activeWorkspaces.map((workspace) => workspace.id);
  const currentID = ids[index];
  const targetID = ids[targetIndex];
  if (currentID === undefined || targetID === undefined) {
    return;
  }
  ids[index] = targetID;
  ids[targetIndex] = currentID;
  void reorderWorkspaces(ids);
}
