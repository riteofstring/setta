import { DesktopLauncherSettingsSection } from "components/Launcher/DesktopLauncherSettingsSection";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerMode } from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_get_launcher_filesystem_roots,
  route_get_launcher_recent_workspaces,
  route_list_launcher_directory,
  route_open_launcher_workspace,
  route_pin_launcher_recent_workspace,
  route_remove_launcher_recent_workspace,
} from "utils/generatedEndpoints";
import type {
  LauncherFilesystemRootsResponse,
  LauncherDirectoryEntryPayload,
  LauncherListDirectoryRequestInput,
  LauncherListDirectoryResponse,
  LauncherOpenWorkspaceResponse,
  LauncherRecentWorkspacePayload,
  LauncherRecentWorkspacesResponse,
} from "utils/generatedTypes";
import { appendLauncherOriginToBootstrapUrlFragment } from "utils/launcherOrigin";
import { resolveServerModeCapabilities } from "utils/serverModeCapabilities";

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

function resolveBootstrapUrl(bootstrapUrlFragment: string): string {
  if (import.meta.env?.DEV) {
    return bootstrapUrlFragment;
  }
  return appendLauncherOriginToBootstrapUrlFragment(
    bootstrapUrlFragment,
    C_ADDRESSES.LAUNCHER_ORIGIN,
  );
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
  entries: Array<LauncherDirectoryEntryPayload>;
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
  ResponseDataAndStatus<LauncherOpenWorkspaceResponse>;

export function applyDirectoryListingPage({
  previousEntries,
  payload,
  append,
}: {
  previousEntries: Array<LauncherDirectoryEntryPayload>;
  payload: LauncherListDirectoryResponse;
  append: boolean;
}): DirectoryListingState {
  const nextEntries = append
    ? [...previousEntries, ...payload.entries]
    : payload.entries;
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

export function LauncherHomePage() {
  const launcherContext = useMemo(resolveLauncherContextFromQueryParam, []);
  const serverMode = useServerMode((state) => state.mode);
  const serverModeCapabilities = useMemo(
    () => resolveServerModeCapabilities(serverMode),
    [serverMode],
  );

  const [recentWorkspaces, setRecentWorkspaces] = useState<
    Array<LauncherRecentWorkspacePayload>
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
    const response: LauncherRecentWorkspacesRouteResponse =
      await route_get_launcher_recent_workspaces({
      setta_home: launcherContext.settaHome,
      });
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
    setRecentWorkspaces(response.data.workspaces);
    setRecentWorkspacesError(null);
  }

  async function loadFilesystemRoots() {
    const response: LauncherFilesystemRootsRouteResponse =
      await route_get_launcher_filesystem_roots();
    if (!res200(response) || !response.data || !response.data.ok) {
      return;
    }
    setFilesystemRoots(response.data.roots);
  }

  async function loadDirectory(
    path: string | null,
    options?: DirectoryLoadOptions,
  ) {
    const append = options?.append === true;
    const request: LauncherListDirectoryRequestInput = {
      path,
      cursor: options?.cursor ?? null,
      pageSize: DIRECTORY_PAGE_SIZE,
    };
    const requestId = latestDirectoryRequestIdRef.current + 1;
    latestDirectoryRequestIdRef.current = requestId;
    setDirectoryActionInFlight(append ? "load-more" : "navigate");

    try {
      const response: LauncherListDirectoryRouteResponse =
        await route_list_launcher_directory(request);
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

    const response: LauncherOpenWorkspaceRouteResponse =
      await route_open_launcher_workspace({
      workspaceRoot,
      createIfMissing,
      settaFilesLocation: "auto",
      settaHome: launcherContext.settaHome,
      });

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
      resolveBootstrapUrl(response.data.bootstrapUrlFragment),
    );
  }

  async function togglePinWorkspace(entry: LauncherRecentWorkspacePayload) {
    setRecentActionInFlight("pin");
    const response: LauncherRecentWorkspacesRouteResponse =
      await route_pin_launcher_recent_workspace({
      workspaceRoot: entry.workspaceRoot,
      pinned: !entry.pinned,
      settaHome: launcherContext.settaHome,
      });
    setRecentActionInFlight(null);

    if (!res200(response) || !response.data || !response.data.ok) {
      setRecentWorkspacesError(
        response.data?.error?.message ?? "Failed to update pinned state.",
      );
      return;
    }

    setRecentWorkspaces(response.data.workspaces);
    setRecentWorkspacesError(null);
  }

  async function removeRecentWorkspace(entry: LauncherRecentWorkspacePayload) {
    setRecentActionInFlight("remove");
    const response: LauncherRecentWorkspacesRouteResponse =
      await route_remove_launcher_recent_workspace({
      workspaceRoot: entry.workspaceRoot,
      settaHome: launcherContext.settaHome,
      });
    setRecentActionInFlight(null);

    if (!res200(response) || !response.data || !response.data.ok) {
      setRecentWorkspacesError(
        response.data?.error?.message ?? "Failed to remove recent workspace.",
      );
      return;
    }

    setRecentWorkspaces(response.data.workspaces);
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
          onClick={() => {
            setRecentActionInFlight("refresh");
            void bootstrapLauncherHome().finally(() => {
              setRecentActionInFlight(null);
            });
          }}
          disabled={launcherBusy}
        >
          {recentActionInFlight === "refresh" ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-setta-200 bg-white/80 p-3 dark:border-setta-700 dark:bg-setta-900/40">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-setta-700 dark:text-setta-200">
              Recent Workspaces
            </h2>
            <span className="text-xs text-setta-500 dark:text-setta-400">
              {sortedRecentWorkspaces.length}
            </span>
          </div>

          {recentWorkspacesError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
              {recentWorkspacesError}
            </div>
          )}

          <div
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            data-testid="launcher-recent-list"
          >
            {sortedRecentWorkspaces.length === 0 && (
              <p className="rounded-md border border-dashed border-setta-200 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:text-setta-400">
                No recent workspaces yet.
              </p>
            )}

            {sortedRecentWorkspaces.map((entry) => (
              <article
                key={entry.workspaceRoot}
                className="rounded-lg border border-setta-200 bg-setta-50/60 px-3 py-2 dark:border-setta-700 dark:bg-setta-900/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-sm font-medium text-setta-800 hover:text-setta-950 dark:text-setta-100 dark:hover:text-white"
                    onClick={() => {
                      setSelectedWorkspacePath(entry.workspaceRoot);
                    }}
                  >
                    {entry.workspaceRoot}
                  </button>
                  {entry.pinned && (
                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                      Pinned
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
                  Last used: {formatRecentTimestamp(entry.lastUsedAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-setta-300 px-2.5 py-1 text-[11px] font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                    disabled={launcherBusy}
                    onClick={() => {
                      void openWorkspace(entry.workspaceRoot, false);
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-setta-300 px-2.5 py-1 text-[11px] font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                    disabled={launcherBusy}
                    onClick={() => {
                      void togglePinWorkspace(entry);
                    }}
                  >
                    {entry.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-red-300 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                    disabled={launcherBusy}
                    onClick={() => {
                      void removeRecentWorkspace(entry);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-setta-200 bg-white/80 p-3 dark:border-setta-700 dark:bg-setta-900/40">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-setta-700 dark:text-setta-200">
              Directory Picker
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => {
                  if (!parentPath) {
                    return;
                  }
                  void loadDirectory(parentPath);
                }}
                disabled={launcherBusy || !parentPath}
              >
                Up
              </button>
              <button
                type="button"
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => {
                  void loadDirectory(currentPath, { append: false });
                }}
                disabled={launcherBusy}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="rounded-md border border-setta-200 bg-setta-50/70 px-3 py-2 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/30 dark:text-setta-300">
            <p>
              Current path:{" "}
              <span className="font-semibold">{currentPath ?? "(roots)"}</span>
            </p>
            {filesystemRoots.length > 0 && (
              <p className="mt-1 break-all text-[11px] text-setta-500 dark:text-setta-400">
                Allowed roots: {filesystemRoots.join(" | ")}
              </p>
            )}
          </div>

          {directoryListing.error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
              {directoryListing.error}
            </div>
          )}
          {directoryListing.truncated && (
            <div
              data-testid="launcher-directory-truncated"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200"
            >
              Directory results are truncated. Narrow this path to view
              additional folders.
            </div>
          )}

          <div
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            data-testid="launcher-directory-list"
          >
            {directoryListing.entries.length === 0 && (
              <p className="rounded-md border border-dashed border-setta-200 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:text-setta-400">
                No directories found for this location.
              </p>
            )}

            {directoryListing.entries.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center justify-between gap-2 rounded-lg border border-setta-200 bg-setta-50/60 px-3 py-2 dark:border-setta-700 dark:bg-setta-900/30"
              >
                <button
                  type="button"
                  className="truncate text-left text-sm text-setta-800 hover:text-setta-950 dark:text-setta-100 dark:hover:text-white"
                  onClick={() => {
                    setSelectedWorkspacePath(entry.path);
                  }}
                >
                  {entry.name}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-setta-300 px-2.5 py-1 text-[11px] font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                    disabled={launcherBusy || !entry.isDirectory}
                    onClick={() => {
                      void loadDirectory(entry.path, { append: false });
                    }}
                  >
                    Browse
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-setta-300 px-2.5 py-1 text-[11px] font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                    disabled={launcherBusy || !entry.isDirectory}
                    onClick={() => {
                      void openWorkspace(entry.path, false);
                    }}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
            {directoryListing.hasMore && (
              <button
                type="button"
                data-testid="launcher-directory-load-more"
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={launcherBusy}
                onClick={() => {
                  void loadMoreDirectoryEntries();
                }}
              >
                {directoryActionInFlight === "load-more"
                  ? "Loading..."
                  : "Load more"}
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-setta-200 bg-white/80 p-3 dark:border-setta-700 dark:bg-setta-900/40">
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
              className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
              value={selectedWorkspacePath}
              onChange={(event) => {
                setSelectedWorkspacePath(event.target.value);
              }}
              spellCheck={false}
            />
          </div>
          <button
            type="button"
            data-testid="launcher-open-selected-button"
            className="rounded-full bg-setta-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-setta-800 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-setta-600"
            disabled={launcherBusy || !selectedWorkspacePath.trim()}
            onClick={() => {
              void openWorkspace(selectedWorkspacePath, false);
            }}
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
              className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
              value={newProjectName}
              onChange={(event) => {
                setNewProjectName(event.target.value);
              }}
              placeholder="my-new-project"
              spellCheck={false}
            />
            <p className="text-xs text-setta-500 dark:text-setta-400">
              Creates{" "}
              <span className="font-semibold">
                {currentPath ?? "<pick a directory>"}
              </span>
              / {normalizeNewProjectName(newProjectName) || "<project-name>"}
            </p>
          </div>
          <button
            type="button"
            data-testid="launcher-create-project-button"
            className="rounded-full border border-setta-300 px-5 py-2 text-sm font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
            disabled={
              launcherBusy ||
              !currentPath ||
              !normalizeNewProjectName(newProjectName)
            }
            onClick={() => {
              void handleCreateProject();
            }}
          >
            {openInFlight ? "Creating..." : "Create and Open Project"}
          </button>
        </div>

        {openError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
            {openError}
          </div>
        )}
      </section>

      {serverModeCapabilities.canManageDesktopLauncher && (
        <DesktopLauncherSettingsSection settaHome={launcherContext.settaHome} />
      )}
    </main>
  );
}
