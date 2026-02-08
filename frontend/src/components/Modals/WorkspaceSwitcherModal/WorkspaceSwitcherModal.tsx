import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { closeModal } from "state/actions/modal";
import { C_ADDRESSES } from "utils/c_addresses";
import { WORKSPACE_LAUNCH_ROUTER_PATH } from "utils/constants";
import {
  RouteEnum,
  type LaunchRequestInput,
  type SettaHomeInfoResponse,
} from "utils/generatedTypes";
import {
  normalizeSettaFilesLocation,
  type SettaFilesLocation,
} from "utils/settaFilesLocation";
import {
  loadWorkspaceHistory,
  saveWorkspaceHistory,
  workspaceHistoryEntryKey,
  type WorkspaceHistoryEntry,
} from "utils/workspaceHistory";
import {
  encodePendingWorkspaceLaunchForUrlHash,
  readWorkspaceSwitcherDraft,
  writePendingWorkspaceLaunch,
  writeWorkspaceSwitcherDraft,
} from "utils/workspaceSwitcherLaunch";

export function WorkspaceSwitcherModal() {
  const navigate = useNavigate();
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [settaFilesLocation, setSettaFilesLocation] =
    useState<SettaFilesLocation>("auto");
  const [launcherSettaHomeInfo, setLauncherSettaHomeInfo] =
    useState<SettaHomeInfoResponse | null>(null);
  const [sshArgs, setSshArgs] = useState("");
  const [remoteCmd, setRemoteCmd] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [history, setHistory] = useState<WorkspaceHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHistory(loadWorkspaceHistory());

    const draft = readWorkspaceSwitcherDraft();
    if (draft) {
      setWorkspaceRoot(draft.workspaceRoot ?? "");
      setSshTarget(draft.sshTarget ?? "");
      setSettaFilesLocation(
        normalizeSettaFilesLocation(draft.settaFilesLocation),
      );
      setSshArgs(draft.sshArgs ?? "");
      setRemoteCmd(draft.remoteCmd ?? "");
      setLocalPort(
        typeof draft.localPort === "number" ? String(draft.localPort) : "",
      );
    }

    async function hydrateLauncherSettaHomeInfo() {
      try {
        const response = await fetch(
          `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_SETTA_HOME_INFO}`,
          {
            credentials: "include",
          },
        );
        if (!isMounted || response.status !== 200) {
          return;
        }
        const data: unknown = await response.json();
        if (!data || typeof data !== "object") {
          return;
        }
        const record = data as Record<string, unknown>;
        if (
          typeof record.settaHome !== "string" ||
          typeof record.globalSettaFilesBase !== "string"
        ) {
          return;
        }
        setLauncherSettaHomeInfo(record as SettaHomeInfoResponse);
      } catch {
        // Ignore network errors; the UI will fall back to placeholder strings.
      }
    }

    void hydrateLauncherSettaHomeInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  const trimmedWorkspace = workspaceRoot.trim();
  const trimmedSshTarget = sshTarget.trim();
  const trimmedSshArgs = sshArgs.trim();
  const trimmedRemoteCmd = remoteCmd.trim();
  const trimmedLocalPort = localPort.trim();
  const globalBaseLabel =
    trimmedSshTarget.length > 0
      ? "remote Setta home"
      : launcherSettaHomeInfo?.globalSettaFilesBase ?? "<global_setta_files_base>";
  const canLaunch = trimmedWorkspace.length > 0 && !isLaunching;

  const orderedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }, [history]);

  function onSelectHistory(entry: WorkspaceHistoryEntry) {
    setWorkspaceRoot(entry.workspaceRoot);
    setSshTarget(entry.sshTarget ?? "");
    setSettaFilesLocation(entry.settaFilesLocation);
    setSshArgs("");
    setRemoteCmd("");
    setLocalPort(entry.localPort ? String(entry.localPort) : "");
    setError(null);
  }

  function clearHistory() {
    setHistory([]);
    saveWorkspaceHistory([]);
  }

  async function handleLaunch() {
    setError(null);
    if (!trimmedWorkspace) {
      setError("Enter a workspace path to continue.");
      return;
    }
    let parsedLocalPort: number | undefined = undefined;
    if (trimmedLocalPort) {
      const asNumber = Number(trimmedLocalPort);
      if (!Number.isFinite(asNumber) || !Number.isInteger(asNumber)) {
        setError("Local port must be a whole number.");
        return;
      }
      if (asNumber < 1 || asNumber > 65535) {
        setError("Local port must be between 1 and 65535.");
        return;
      }
      parsedLocalPort = asNumber;
    }
    setIsLaunching(true);

    const request: LaunchRequestInput = {
      workspaceRoot: trimmedWorkspace,
      settaFilesLocation,
      sshTarget: trimmedSshTarget || null,
      sshArgs: trimmedSshArgs || null,
      remoteCmd: trimmedRemoteCmd || null,
      localPort: parsedLocalPort ?? null,
    };

    writeWorkspaceSwitcherDraft(request);
    const pendingLaunch = {
      request,
      returnUrl: typeof window !== "undefined" ? window.location.href : "/",
      requestedAt: Date.now(),
    };

    if (
      !import.meta.env?.DEV &&
      typeof window !== "undefined" &&
      C_ADDRESSES.LAUNCHER_ORIGIN !== window.location.origin
    ) {
      const encoded = encodePendingWorkspaceLaunchForUrlHash(pendingLaunch);
      if (!encoded) {
        setIsLaunching(false);
        setError("Failed to encode launch request.");
        return;
      }
      const url = new URL(
        WORKSPACE_LAUNCH_ROUTER_PATH,
        C_ADDRESSES.LAUNCHER_ORIGIN,
      );
      const params = new URLSearchParams(
        url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
      );
      params.set("pl", encoded);
      url.hash = params.toString();
      closeModal();
      window.location.assign(url.toString());
      return;
    }

    writePendingWorkspaceLaunch(pendingLaunch);

    closeModal();
    navigate(WORKSPACE_LAUNCH_ROUTER_PATH);
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
          Switch Workspace
        </Dialog.Title>
        <Dialog.Description className="text-sm text-setta-600 dark:text-setta-300">
          Start or reuse a session for a different workspace, then reload into
          it.
        </Dialog.Description>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
              Workspace Path
            </label>
            <input
              className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
              placeholder="/path/to/workspace"
              value={workspaceRoot}
              onChange={(event) => setWorkspaceRoot(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
              SSH Target (Optional)
            </label>
            <input
              className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
              placeholder="user@host"
              value={sshTarget}
              onChange={(event) => setSshTarget(event.target.value)}
              spellCheck={false}
            />
            <p className="text-xs text-setta-500 dark:text-setta-400">
              Leave blank for local workspaces. When set, Setta will start (or
              reuse) a remote session and open a local tunnel.
            </p>
          </div>

          {trimmedSshTarget.length > 0 && (
            <div className="grid gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
                  SSH Args (Optional)
                </label>
                <input
                  className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  placeholder="-i ~/.ssh/id_ed25519 -J user@jump"
                  value={sshArgs}
                  onChange={(event) => setSshArgs(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
                  Remote Cmd (Optional)
                </label>
                <input
                  className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  placeholder="source .venv/bin/activate && setta"
                  value={remoteCmd}
                  onChange={(event) => setRemoteCmd(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
                  Local Tunnel Port (Optional)
                </label>
                <input
                  className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  placeholder="61000"
                  value={localPort}
                  onChange={(event) => setLocalPort(event.target.value)}
                  spellCheck={false}
                  inputMode="numeric"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <label
              htmlFor="setta-files-location"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400"
            >
              Setta Files Location
            </label>
            <select
              id="setta-files-location"
              aria-label="Setta Files Location"
              className="w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
              value={settaFilesLocation}
              onChange={(event) => {
                setSettaFilesLocation(
                  normalizeSettaFilesLocation(event.target.value),
                );
              }}
            >
              <option value="auto">Default (auto)</option>
              <option value="local">Local (workspace)</option>
              <option value="global">Global ({globalBaseLabel})</option>
            </select>
            <p className="text-xs text-setta-500 dark:text-setta-400">
              If the workspace already has a local{" "}
              <span className="font-semibold">setta_files/</span>, Setta will
              use it even when Global is selected.
              {trimmedSshTarget.length > 0
                ? " For SSH targets, Global refers to the remote machine's Setta home."
                : null}
            </p>
          </div>

          {orderedHistory.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-setta-50 p-3 dark:border-setta-700 dark:bg-setta-900/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
                  Recent Workspaces
                </span>
                <button
                  className="text-[10px] font-semibold uppercase tracking-[0.2em] text-setta-500 hover:text-setta-700 dark:text-setta-300"
                  onClick={clearHistory}
                >
                  Clear
                </button>
              </div>
              <div className="grid gap-2">
                {orderedHistory.map((entry) => (
                  <button
                    key={workspaceHistoryEntryKey(entry)}
                    className="flex flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left text-sm text-setta-700 transition hover:border-setta-200 hover:bg-white dark:text-setta-200 dark:hover:border-setta-700 dark:hover:bg-setta-800"
                    onClick={() => onSelectHistory(entry)}
                  >
                    <span className="truncate font-medium">
                      {entry.workspaceRoot}
                    </span>
                    <span className="truncate text-[11px] text-setta-500 dark:text-setta-400">
                      Setta files: {entry.settaFilesLocation}
                    </span>
                    {entry.sshTarget && (
                      <span className="truncate text-[11px] text-setta-500 dark:text-setta-400">
                        SSH: {entry.sshTarget}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-setta-200 pt-4 dark:border-setta-700">
        <button
          className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-sm text-setta-700 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={closeModal}
        >
          Cancel
        </button>
        <button
          className="cursor-pointer rounded-full bg-setta-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-setta-800 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-setta-600"
          onClick={handleLaunch}
          disabled={!canLaunch}
        >
          {isLaunching ? "Launching..." : "Launch"}
        </button>
      </div>
    </div>
  );
}
