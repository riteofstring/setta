import { DesktopLauncherSettingsSection } from "components/Launcher/DesktopLauncherSettingsSection";
import {
  getLauncherFilesystemRoots,
  getLauncherRecentWorkspaces,
  listLauncherDirectory,
  openLauncherWorkspace,
  pinLauncherRecentWorkspace,
  removeLauncherRecentWorkspace,
  type GetLauncherFilesystemRootsResponse,
  type GetLauncherRecentWorkspacesResponse,
  type ListLauncherDirectoryResponse,
  type OpenLauncherWorkspaceResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerMode } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import { resolveLauncherBootstrapUrl } from "utils/launcherBootstrapUrl";
import { resolveServerModeCapabilities } from "utils/serverModeCapabilities";
type LauncherListDirectoryRequest = NonNullable<
  Parameters<typeof listLauncherDirectory>[0]
>["body"];
type LauncherFilesystemRootsResponse = GetLauncherFilesystemRootsResponse;
type LauncherRecentWorkspacesResponse = GetLauncherRecentWorkspacesResponse;
type LauncherOpenWorkspacePayload = OpenLauncherWorkspaceResponse;
type DirectoryEntry = NonNullable<
  ListLauncherDirectoryResponse["entries"]
>[number];
type RecentWorkspaceEntry = NonNullable<
  GetLauncherRecentWorkspacesResponse["workspaces"]
>[number];
export function normalizeNewProjectName(rawValue: string): string {
  return rawValue.trim().replace(/[\\/]+/g, "");
}
export function isReservedProjectName(rawValue: string): boolean {
  const normalized = normalizeNewProjectName(rawValue);
  return normalized === "." || normalized === "..";
}
export function joinLauncherPath(
  parentPath: string,
  childName: string,
): string {
  const normalizedParent = parentPath.trim();
  const normalizedChild = normalizeNewProjectName(childName);
  if (!normalizedParent) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return normalizedParent;
  }
  const endsWithSeparator =
    normalizedParent.endsWith("/") || normalizedParent.endsWith("\\");
  if (endsWithSeparator) {
    return `${normalizedParent}${normalizedChild}`;
  }
  const useBackslash =
    normalizedParent.includes("\\") && !normalizedParent.includes("/");
  if (useBackslash) {
    return `${normalizedParent}\\${normalizedChild}`;
  }
  return `${normalizedParent}/${normalizedChild}`;
}
function formatRecentTimestamp(lastUsedAt: number): string {
  const millis = lastUsedAt * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
}
type LauncherContext = {
  settaHome: string | null;
};
function resolveLauncherContextFromQueryParam(): LauncherContext {
  const searchParams = new URL(window.location.href).searchParams;
  const rawSettaHome = searchParams.get("setta_home");
  if (rawSettaHome === null) {
    return { settaHome: null };
  }
  const normalizedSettaHome = rawSettaHome.trim();
  if (!normalizedSettaHome) {
    return { settaHome: null };
  }
  return { settaHome: normalizedSettaHome };
}
type RecentActionInFlight = "refresh" | "pin" | "remove" | "open" | null;
type DirectoryActionInFlight = "navigate" | "load-more" | null;
type DirectoryLoadOptions = {
  cursor?: string | null;
  append?: boolean;
};
const DIRECTORY_PAGE_SIZE = 250;
type DirectoryListingState = {
  entries: Array<DirectoryEntry>;
  hasMore: boolean;
  nextCursor: string | null;
  truncated: boolean;
  error: string | null;
};
type LauncherRecentWorkspacesRouteResponse =
  ResponseDataAndStatus<LauncherRecentWorkspacesResponse>;
type LauncherFilesystemRootsRouteResponse =
  ResponseDataAndStatus<LauncherFilesystemRootsResponse>;
type LauncherListDirectoryRouteResponse =
  ResponseDataAndStatus<LauncherListDirectoryResponse>;
type LauncherOpenWorkspaceRouteResponse =
  ResponseDataAndStatus<LauncherOpenWorkspacePayload>;
const launcherPanelClassName =
  "flex min-h-0 flex-col gap-3 rounded-xl border border-setta-200 bg-white/80 p-3 dark:border-setta-700 dark:bg-setta-900/40";
const launcherSecondaryButtonClassName =
  "rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800";
const launcherSmallSecondaryButtonClassName =
  "rounded-full border border-setta-300 px-2.5 py-1 text-[11px] font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800";
const launcherDangerButtonClassName =
  "rounded-full border border-red-300 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30";
const launcherInputClassName =
  "w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100";
const launcherPrimaryButtonClassName =
  "rounded-full bg-setta-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-setta-800 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-setta-600";
export function applyDirectoryListingPage({
  previousEntries,
  payload,
  append,
}: {
  previousEntries: Array<DirectoryEntry>;
  payload: LauncherListDirectoryResponse;
  append: boolean;
}): DirectoryListingState {
  const payloadEntries = payload.entries ?? [];
  const nextEntries = append
    ? [...previousEntries, ...payloadEntries]
    : payloadEntries;
  if (payload.hasMore && !payload.nextCursor) {
    return {
      entries: nextEntries,
      hasMore: payload.hasMore,
      nextCursor: payload.nextCursor,
      truncated: payload.truncated,
      error:
        "Directory listing reported more results without a continuation cursor.",
    };
  }
  return {
    entries: nextEntries,
    hasMore: payload.hasMore,
    nextCursor: payload.nextCursor,
    truncated: payload.truncated,
    error: null,
  };
}
type LauncherHomeHeaderProps = {
  launcherBusy: boolean;
  recentActionInFlight: RecentActionInFlight;
  onRefresh: () => void;
};
function LauncherHomeHeader({
  launcherBusy,
  recentActionInFlight,
  onRefresh,
}: LauncherHomeHeaderProps) {
  const refreshLabel =
    recentActionInFlight === "refresh" ? "Refreshing..." : "Refresh";
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-setta-800 dark:text-setta-100">
          Launcher Home
        </h1>
        <p className="text-sm text-setta-500 dark:text-setta-300">
          Pick a workspace, create a new project folder, and open Setta IDE.
        </p>
      </div>
      <button
        type="button"
        className="rounded-full border border-setta-300 px-4 py-2 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={onRefresh}
        disabled={launcherBusy}
      >
        {refreshLabel}
      </button>
    </header>
  );
}
type RecentWorkspaceCardProps = {
  entry: RecentWorkspaceEntry;
  launcherBusy: boolean;
  onSelectWorkspace: (workspaceRoot: string) => void;
  onOpenWorkspace: (workspaceRoot: string) => void;
  onTogglePinWorkspace: (entry: RecentWorkspaceEntry) => void;
  onRemoveRecentWorkspace: (entry: RecentWorkspaceEntry) => void;
};
function RecentWorkspaceCard({
  entry,
  launcherBusy,
  onSelectWorkspace,
  onOpenWorkspace,
  onTogglePinWorkspace,
  onRemoveRecentWorkspace,
}: RecentWorkspaceCardProps) {
  const pinLabel = entry.pinned ? "Unpin" : "Pin";
  return (
    <article className="rounded-lg border border-setta-200 bg-setta-50/60 px-3 py-2 dark:border-setta-700 dark:bg-setta-900/30">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="truncate text-left text-sm font-medium text-setta-800 hover:text-setta-950 dark:text-setta-100 dark:hover:text-white"
          onClick={() => {
            onSelectWorkspace(entry.workspaceRoot);
          }}
        >
          {entry.workspaceRoot}
        </button>
        {entry.pinned ? (
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            Pinned
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
        Last used: {formatRecentTimestamp(entry.lastUsedAt)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={launcherSmallSecondaryButtonClassName}
          disabled={launcherBusy}
          onClick={() => {
            onOpenWorkspace(entry.workspaceRoot);
          }}
        >
          Open
        </button>
        <button
          type="button"
          className={launcherSmallSecondaryButtonClassName}
          disabled={launcherBusy}
          onClick={() => {
            onTogglePinWorkspace(entry);
          }}
        >
          {pinLabel}
        </button>
        <button
          type="button"
          className={launcherDangerButtonClassName}
          disabled={launcherBusy}
          onClick={() => {
            onRemoveRecentWorkspace(entry);
          }}
        >
          Remove
        </button>
      </div>
    </article>
  );
}
type RecentWorkspacesSectionProps = {
  recentWorkspaces: Array<RecentWorkspaceEntry>;
  recentWorkspacesError: string | null;
  launcherBusy: boolean;
  onSelectWorkspace: (workspaceRoot: string) => void;
  onOpenWorkspace: (workspaceRoot: string) => void;
  onTogglePinWorkspace: (entry: RecentWorkspaceEntry) => void;
  onRemoveRecentWorkspace: (entry: RecentWorkspaceEntry) => void;
};
function RecentWorkspacesSection({
  recentWorkspaces,
  recentWorkspacesError,
  launcherBusy,
  onSelectWorkspace,
  onOpenWorkspace,
  onTogglePinWorkspace,
  onRemoveRecentWorkspace,
}: RecentWorkspacesSectionProps) {
  return (
    <section className={launcherPanelClassName}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-setta-700 dark:text-setta-200">
          Recent Workspaces
        </h2>
        <span className="text-xs text-setta-500 dark:text-setta-400">
          {recentWorkspaces.length}
        </span>
      </div>

      {recentWorkspacesError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
          {recentWorkspacesError}
        </div>
      ) : null}

      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
        data-testid="launcher-recent-list"
      >
        {recentWorkspaces.length === 0 ? (
          <p className="rounded-md border border-dashed border-setta-200 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:text-setta-400">
            No recent workspaces yet.
          </p>
        ) : null}

        {recentWorkspaces.map((entry) => (
          <RecentWorkspaceCard
            key={entry.workspaceRoot}
            entry={entry}
            launcherBusy={launcherBusy}
            onSelectWorkspace={onSelectWorkspace}
            onOpenWorkspace={onOpenWorkspace}
            onTogglePinWorkspace={onTogglePinWorkspace}
            onRemoveRecentWorkspace={onRemoveRecentWorkspace}
          />
        ))}
      </div>
    </section>
  );
}
type DirectoryEntryRowProps = {
  entry: DirectoryEntry;
  launcherBusy: boolean;
  onSelectWorkspace: (path: string) => void;
  onBrowse: (path: string) => void;
  onOpen: (path: string) => void;
};
function DirectoryEntryRow({
  entry,
  launcherBusy,
  onSelectWorkspace,
  onBrowse,
  onOpen,
}: DirectoryEntryRowProps) {
  const entryDisabled = launcherBusy || !entry.isDirectory;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-setta-200 bg-setta-50/60 px-3 py-2 dark:border-setta-700 dark:bg-setta-900/30">
      <button
        type="button"
        className="truncate text-left text-sm text-setta-800 hover:text-setta-950 dark:text-setta-100 dark:hover:text-white"
        onClick={() => {
          onSelectWorkspace(entry.path);
        }}
      >
        {entry.name}
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={launcherSmallSecondaryButtonClassName}
          disabled={entryDisabled}
          onClick={() => {
            onBrowse(entry.path);
          }}
        >
          Browse
        </button>
        <button
          type="button"
          className={launcherSmallSecondaryButtonClassName}
          disabled={entryDisabled}
          onClick={() => {
            onOpen(entry.path);
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}
type DirectoryPickerSectionProps = {
  currentPath: string | null;
  parentPath: string | null;
  filesystemRoots: Array<string>;
  directoryListing: DirectoryListingState;
  launcherBusy: boolean;
  directoryActionInFlight: DirectoryActionInFlight;
  onNavigateUp: () => void;
  onRefresh: () => void;
  onSelectWorkspace: (path: string) => void;
  onBrowse: (path: string) => void;
  onOpen: (path: string) => void;
  onLoadMore: () => void;
};
function DirectoryPickerSection({
  currentPath,
  parentPath,
  filesystemRoots,
  directoryListing,
  launcherBusy,
  directoryActionInFlight,
  onNavigateUp,
  onRefresh,
  onSelectWorkspace,
  onBrowse,
  onOpen,
  onLoadMore,
}: DirectoryPickerSectionProps) {
  const currentPathLabel = currentPath ?? "(roots)";
  const allowedRoots = filesystemRoots.join(" | ");
  const loadMoreLabel =
    directoryActionInFlight === "load-more" ? "Loading..." : "Load more";
  return (
    <section className={launcherPanelClassName}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-setta-700 dark:text-setta-200">
          Directory Picker
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={launcherSecondaryButtonClassName}
            onClick={onNavigateUp}
            disabled={launcherBusy || !parentPath}
          >
            Up
          </button>
          <button
            type="button"
            className={launcherSecondaryButtonClassName}
            onClick={onRefresh}
            disabled={launcherBusy}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-md border border-setta-200 bg-setta-50/70 px-3 py-2 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/30 dark:text-setta-300">
        <p>
          Current path:{" "}
          <span className="font-semibold">{currentPathLabel}</span>
        </p>
        {filesystemRoots.length > 0 ? (
          <p className="mt-1 break-all text-[11px] text-setta-500 dark:text-setta-400">
            Allowed roots: {allowedRoots}
          </p>
        ) : null}
      </div>

      {directoryListing.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
          {directoryListing.error}
        </div>
      ) : null}
      {directoryListing.truncated ? (
        <div
          data-testid="launcher-directory-truncated"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200"
        >
          Directory results are truncated. Narrow this path to view additional
          folders.
        </div>
      ) : null}

      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
        data-testid="launcher-directory-list"
      >
        {directoryListing.entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-setta-200 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:text-setta-400">
            No directories found for this location.
          </p>
        ) : null}

        {directoryListing.entries.map((entry) => (
          <DirectoryEntryRow
            key={entry.path}
            entry={entry}
            launcherBusy={launcherBusy}
            onSelectWorkspace={onSelectWorkspace}
            onBrowse={onBrowse}
            onOpen={onOpen}
          />
        ))}
        {directoryListing.hasMore ? (
          <button
            type="button"
            data-testid="launcher-directory-load-more"
            className={launcherSecondaryButtonClassName}
            disabled={launcherBusy}
            onClick={onLoadMore}
          >
            {loadMoreLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
type OpenWorkspaceSectionProps = {
  selectedWorkspacePath: string;
  newProjectName: string;
  currentPath: string | null;
  launcherBusy: boolean;
  openInFlight: boolean;
  openError: string | null;
  onSelectedWorkspaceChange: (value: string) => void;
  onNewProjectNameChange: (value: string) => void;
  onOpenSelectedWorkspace: () => void;
  onCreateProject: () => void;
};
function OpenWorkspaceSection({
  selectedWorkspacePath,
  newProjectName,
  currentPath,
  launcherBusy,
  openInFlight,
  openError,
  onSelectedWorkspaceChange,
  onNewProjectNameChange,
  onOpenSelectedWorkspace,
  onCreateProject,
}: OpenWorkspaceSectionProps) {
  const normalizedProjectName = normalizeNewProjectName(newProjectName);
  const projectTarget = normalizedProjectName || "<project-name>";
  const currentPathLabel = currentPath ?? "<pick a directory>";
  return (
    <section className={launcherPanelClassName}>
      <h2 className="text-sm font-semibold text-setta-700 dark:text-setta-200">
        Open Workspace
      </h2>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-1">
          <label
            htmlFor="launcher-selected-workspace"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400"
          >
            Selected Workspace
          </label>
          <input
            id="launcher-selected-workspace"
            data-testid="launcher-selected-workspace-input"
            className={launcherInputClassName}
            value={selectedWorkspacePath}
            onChange={(event) => {
              onSelectedWorkspaceChange(event.target.value);
            }}
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          data-testid="launcher-open-selected-button"
          className={launcherPrimaryButtonClassName}
          disabled={launcherBusy || !selectedWorkspacePath.trim()}
          onClick={onOpenSelectedWorkspace}
        >
          {openInFlight ? "Opening..." : "Open Selected Workspace"}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-1">
          <label
            htmlFor="launcher-new-project-name"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400"
          >
            New Project Name
          </label>
          <input
            id="launcher-new-project-name"
            data-testid="launcher-new-project-name-input"
            className={launcherInputClassName}
            value={newProjectName}
            onChange={(event) => {
              onNewProjectNameChange(event.target.value);
            }}
            placeholder="my-new-project"
            spellCheck={false}
          />
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Creates <span className="font-semibold">{currentPathLabel}</span> /{" "}
            {projectTarget}
          </p>
        </div>
        <button
          type="button"
          data-testid="launcher-create-project-button"
          className="rounded-full border border-setta-300 px-5 py-2 text-sm font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
          disabled={launcherBusy || !currentPath || !normalizedProjectName}
          onClick={onCreateProject}
        >
          {openInFlight ? "Creating..." : "Create and Open Project"}
        </button>
      </div>

      {openError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
          {openError}
        </div>
      ) : null}
    </section>
  );
}
export function LauncherHomePage() {
  const launcherContext = useMemo(resolveLauncherContextFromQueryParam, []);
  const serverMode = useServerMode((state) => state.mode);
  const serverModeCapabilities = useMemo(
    () => resolveServerModeCapabilities(serverMode),
    [serverMode],
  );
  const [recentWorkspaces, setRecentWorkspaces] = useState<
    Array<RecentWorkspaceEntry>
  >([]);
  const [recentWorkspacesError, setRecentWorkspacesError] = useState<
    string | null
  >(null);
  const [recentActionInFlight, setRecentActionInFlight] =
    useState<RecentActionInFlight>(null);
  const [filesystemRoots, setFilesystemRoots] = useState<Array<string>>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directoryListing, setDirectoryListing] =
    useState<DirectoryListingState>({
      entries: [],
      hasMore: false,
      nextCursor: null,
      truncated: false,
      error: null,
    });
  const [directoryActionInFlight, setDirectoryActionInFlight] =
    useState<DirectoryActionInFlight>(null);
  const latestDirectoryRequestIdRef = useRef(0);
  const [selectedWorkspacePath, setSelectedWorkspacePath] =
    useState<string>("");
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [openInFlight, setOpenInFlight] = useState(false);
  async function loadRecentWorkspaces() {
    const response = (await callOpenAPI(
      getLauncherRecentWorkspaces({
        query: { setta_home: launcherContext.settaHome ?? undefined },
      } as Parameters<typeof getLauncherRecentWorkspaces>[0]),
    )) as LauncherRecentWorkspacesRouteResponse;
    if (!res200(response) || !response.data) {
      setRecentWorkspacesError("Failed to load recent workspaces.");
      return;
    }
    if (!response.data.ok) {
      setRecentWorkspacesError(
        response.data.error?.message ?? "Recent workspaces request failed.",
      );
      return;
    }
    setRecentWorkspaces(response.data.workspaces ?? []);
    setRecentWorkspacesError(null);
  }
  async function loadFilesystemRoots() {
    const response = (await callOpenAPI(
      getLauncherFilesystemRoots(),
    )) as LauncherFilesystemRootsRouteResponse;
    if (!res200(response) || !response.data || !response.data.ok) {
      return;
    }
    setFilesystemRoots(response.data.roots ?? []);
  }
  async function loadDirectory(
    path: string | null,
    options?: DirectoryLoadOptions,
  ) {
    const append = options?.append === true;
    const request: LauncherListDirectoryRequest = {
      path,
      cursor: options?.cursor ?? null,
      pageSize: DIRECTORY_PAGE_SIZE,
    };
    const requestId = latestDirectoryRequestIdRef.current + 1;
    latestDirectoryRequestIdRef.current = requestId;
    setDirectoryActionInFlight(append ? "load-more" : "navigate");
    try {
      const response = (await callOpenAPI(
        listLauncherDirectory({
          body: request,
        } as Parameters<typeof listLauncherDirectory>[0]),
      )) as LauncherListDirectoryRouteResponse;
      if (requestId !== latestDirectoryRequestIdRef.current) {
        return;
      }
      if (!res200(response) || !response.data) {
        setDirectoryListing((previousState) => ({
          ...previousState,
          error: "Failed to load launcher directory listing.",
        }));
        return;
      }
      const payload = response.data;
      if (!payload.ok) {
        setDirectoryListing((previousState) => ({
          ...previousState,
          error: payload.error?.message ?? "Directory listing failed.",
        }));
        return;
      }
      setCurrentPath(payload.currentPath);
      setParentPath(payload.parentPath);
      setDirectoryListing((previousState) =>
        applyDirectoryListingPage({
          previousEntries: previousState.entries,
          payload,
          append,
        }),
      );
    } finally {
      if (requestId === latestDirectoryRequestIdRef.current) {
        setDirectoryActionInFlight(null);
      }
    }
  }
  async function bootstrapLauncherHome() {
    await Promise.all([
      loadRecentWorkspaces(),
      loadFilesystemRoots(),
      loadDirectory(null),
    ]);
  }
  useEffect(() => {
    void bootstrapLauncherHome();
  }, []);
  async function loadMoreDirectoryEntries() {
    if (
      directoryActionInFlight !== null ||
      !currentPath ||
      !directoryListing.hasMore ||
      !directoryListing.nextCursor
    ) {
      return;
    }
    await loadDirectory(currentPath, {
      append: true,
      cursor: directoryListing.nextCursor,
    });
  }
  const sortedRecentWorkspaces = useMemo(() => {
    return [...recentWorkspaces].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return b.lastUsedAt - a.lastUsedAt;
    });
  }, [recentWorkspaces]);
  async function openWorkspace(
    workspaceRoot: string,
    createIfMissing: boolean,
  ) {
    if (!workspaceRoot.trim()) {
      setOpenError("Select a workspace path first.");
      return;
    }
    setOpenInFlight(true);
    setOpenError(null);
    setRecentActionInFlight("open");
    const response = (await callOpenAPI(
      openLauncherWorkspace({
        body: {
          workspaceRoot,
          createIfMissing,
          settaFilesLocation: "auto",
          settaHome: launcherContext.settaHome,
        },
      } as Parameters<typeof openLauncherWorkspace>[0]),
    )) as LauncherOpenWorkspaceRouteResponse;
    if (!res200(response) || !response.data) {
      setOpenInFlight(false);
      setRecentActionInFlight(null);
      setOpenError("Failed to open workspace.");
      return;
    }
    if (!response.data.ok) {
      setOpenInFlight(false);
      setRecentActionInFlight(null);
      setOpenError(response.data.error?.message ?? "Failed to open workspace.");
      return;
    }
    if (!response.data.bootstrapUrlFragment) {
      setOpenInFlight(false);
      setRecentActionInFlight(null);
      setOpenError("Workspace opened but no bootstrap URL was returned.");
      return;
    }
    window.location.assign(
      resolveLauncherBootstrapUrl(response.data.bootstrapUrlFragment),
    );
  }
  async function togglePinWorkspace(entry: RecentWorkspaceEntry) {
    setRecentActionInFlight("pin");
    const response = (await callOpenAPI(
      pinLauncherRecentWorkspace({
        body: {
          workspaceRoot: entry.workspaceRoot,
          pinned: !entry.pinned,
          settaHome: launcherContext.settaHome,
        },
      } as Parameters<typeof pinLauncherRecentWorkspace>[0]),
    )) as LauncherRecentWorkspacesRouteResponse;
    setRecentActionInFlight(null);
    if (!res200(response) || !response.data || !response.data.ok) {
      setRecentWorkspacesError(
        response.data?.error?.message ?? "Failed to update pinned state.",
      );
      return;
    }
    setRecentWorkspaces(response.data.workspaces ?? []);
    setRecentWorkspacesError(null);
  }
  async function removeRecentWorkspace(entry: RecentWorkspaceEntry) {
    setRecentActionInFlight("remove");
    const response = (await callOpenAPI(
      removeLauncherRecentWorkspace({
        body: {
          workspaceRoot: entry.workspaceRoot,
          settaHome: launcherContext.settaHome,
        },
      } as Parameters<typeof removeLauncherRecentWorkspace>[0]),
    )) as LauncherRecentWorkspacesRouteResponse;
    setRecentActionInFlight(null);
    if (!res200(response) || !response.data || !response.data.ok) {
      setRecentWorkspacesError(
        response.data?.error?.message ?? "Failed to remove recent workspace.",
      );
      return;
    }
    setRecentWorkspaces(response.data.workspaces ?? []);
    setRecentWorkspacesError(null);
  }
  async function handleCreateProject() {
    const basePath = currentPath;
    if (!basePath) {
      setOpenError("Pick a base directory before creating a project.");
      return;
    }
    const normalizedProjectName = normalizeNewProjectName(newProjectName);
    if (!normalizedProjectName) {
      setOpenError("Enter a new project name.");
      return;
    }
    if (isReservedProjectName(newProjectName)) {
      setOpenError("Project name cannot be '.' or '..'.");
      return;
    }
    const workspaceRoot = joinLauncherPath(basePath, normalizedProjectName);
    await openWorkspace(workspaceRoot, true);
  }
  const launcherBusy =
    openInFlight ||
    recentActionInFlight !== null ||
    directoryActionInFlight !== null;
  return (
    <main
      className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4"
      data-testid="launcher-home-root"
    >
      <LauncherHomeHeader
        launcherBusy={launcherBusy}
        recentActionInFlight={recentActionInFlight}
        onRefresh={() => {
          setRecentActionInFlight("refresh");
          void bootstrapLauncherHome().finally(() => {
            setRecentActionInFlight(null);
          });
        }}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <RecentWorkspacesSection
          recentWorkspaces={sortedRecentWorkspaces}
          recentWorkspacesError={recentWorkspacesError}
          launcherBusy={launcherBusy}
          onSelectWorkspace={(workspaceRoot) => {
            setSelectedWorkspacePath(workspaceRoot);
          }}
          onOpenWorkspace={(workspaceRoot) => {
            void openWorkspace(workspaceRoot, false);
          }}
          onTogglePinWorkspace={(entry) => {
            void togglePinWorkspace(entry);
          }}
          onRemoveRecentWorkspace={(entry) => {
            void removeRecentWorkspace(entry);
          }}
        />

        <DirectoryPickerSection
          currentPath={currentPath}
          parentPath={parentPath}
          filesystemRoots={filesystemRoots}
          directoryListing={directoryListing}
          launcherBusy={launcherBusy}
          directoryActionInFlight={directoryActionInFlight}
          onNavigateUp={() => {
            if (!parentPath) {
              return;
            }
            void loadDirectory(parentPath);
          }}
          onRefresh={() => {
            void loadDirectory(currentPath, { append: false });
          }}
          onSelectWorkspace={(path) => {
            setSelectedWorkspacePath(path);
          }}
          onBrowse={(path) => {
            void loadDirectory(path, { append: false });
          }}
          onOpen={(path) => {
            void openWorkspace(path, false);
          }}
          onLoadMore={() => {
            void loadMoreDirectoryEntries();
          }}
        />
      </div>

      <OpenWorkspaceSection
        selectedWorkspacePath={selectedWorkspacePath}
        newProjectName={newProjectName}
        currentPath={currentPath}
        launcherBusy={launcherBusy}
        openInFlight={openInFlight}
        openError={openError}
        onSelectedWorkspaceChange={setSelectedWorkspacePath}
        onNewProjectNameChange={setNewProjectName}
        onOpenSelectedWorkspace={() => {
          void openWorkspace(selectedWorkspacePath, false);
        }}
        onCreateProject={() => {
          void handleCreateProject();
        }}
      />

      {serverModeCapabilities.canManageDesktopLauncher && (
        <DesktopLauncherSettingsSection settaHome={launcherContext.settaHome} />
      )}
    </main>
  );
}
