import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { closeModal } from "state/actions/modal";
import { C_ADDRESSES } from "utils/c_addresses";
import { WORKSPACE_LAUNCH_ROUTER_PATH } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_get_launcher_status,
  route_get_setta_home_info,
  route_remove_launcher,
  route_repair_launcher,
  route_setup_launcher,
  route_update_launcher,
} from "utils/generatedEndpoints";
import {
  type LaunchRequestInput,
  type LauncherRequestBaseInput,
  type LauncherStatusResponse,
  type LauncherUpdateResponse,
  type SettaHomeInfoResponse,
  type SetupLauncherRequestInput,
  type UpdateLauncherRequestInput,
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

type LauncherActionState =
  | "refresh"
  | "setup"
  | "repair"
  | "remove"
  | "update"
  | null;

const DEFAULT_LAUNCHER_REQUEST: LauncherRequestBaseInput = {};
const DEFAULT_SETUP_LAUNCHER_REQUEST: SetupLauncherRequestInput = {};
const DEFAULT_UPDATE_LAUNCHER_REQUEST: UpdateLauncherRequestInput = {};

function resolveLauncherErrorMessage(
  payload: LauncherStatusResponse | LauncherUpdateResponse | null | undefined,
  fallback: string,
): string {
  if (payload?.error?.message) {
    return payload.error.message;
  }
  return fallback;
}

function formatLauncherTargetCommand(
  targetCommand: Array<string> | null | undefined,
): string | null {
  if (!targetCommand || targetCommand.length === 0) {
    return null;
  }
  return targetCommand.join(" ");
}

export function WorkspaceSwitcherModal() {
  const navigate = useNavigate();
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [settaFilesLocation, setSettaFilesLocation] =
    useState<SettaFilesLocation>("auto");
  const [launcherSettaHomeInfo, setLauncherSettaHomeInfo] =
    useState<SettaHomeInfoResponse | null>(null);
  const [launcherStatus, setLauncherStatus] =
    useState<LauncherStatusResponse | null>(null);
  const [launcherStatusError, setLauncherStatusError] = useState<string | null>(
    null,
  );
  const [launcherActionMessage, setLauncherActionMessage] = useState<
    string | null
  >(null);
  const [launcherActionError, setLauncherActionError] = useState<string | null>(
    null,
  );
  const [launcherActionInFlight, setLauncherActionInFlight] =
    useState<LauncherActionState>(null);
  const [sshArgs, setSshArgs] = useState("");
  const [remoteCmd, setRemoteCmd] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [history, setHistory] = useState<WorkspaceHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  async function refreshLauncherStatus() {
    setLauncherActionInFlight("refresh");
    setLauncherActionError(null);
    try {
      const response = await route_get_launcher_status();
      if (!res200(response) || !response.data) {
        setLauncherStatusError("Failed to load launcher status.");
        return;
      }
      const payload = response.data;
      setLauncherStatus(payload);
      if (!payload.ok) {
        setLauncherStatusError(
          resolveLauncherErrorMessage(
            payload,
            "Launcher status request failed.",
          ),
        );
        return;
      }
      setLauncherStatusError(null);
    } finally {
      setLauncherActionInFlight(null);
    }
  }

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
      const response = await route_get_setta_home_info();
      if (!isMounted || !res200(response) || !response.data) {
        return;
      }
      setLauncherSettaHomeInfo(response.data);
    }

    void hydrateLauncherSettaHomeInfo();
    void refreshLauncherStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const trimmedWorkspace = workspaceRoot.trim();
  const trimmedSshTarget = sshTarget.trim();
  const trimmedSshArgs = sshArgs.trim();
  const trimmedRemoteCmd = remoteCmd.trim();
  const trimmedLocalPort = localPort.trim();
  let globalBaseLabel = "<global_setta_files_base>";
  if (trimmedSshTarget.length > 0) {
    globalBaseLabel = "remote Setta home";
  } else if (launcherSettaHomeInfo?.globalSettaFilesBase) {
    globalBaseLabel = launcherSettaHomeInfo.globalSettaFilesBase;
  }
  const canLaunch = trimmedWorkspace.length > 0 && !isLaunching;
  const launcherActionsDisabled = launcherActionInFlight !== null;
  const launcherInstalled = launcherStatus?.installed === true;
  const launcherTarget = formatLauncherTargetCommand(
    launcherStatus?.targetCommand,
  );
  const canUpdateInApp =
    launcherInstalled && launcherStatus?.updateCapability === "in_app";
  let launcherSetupButtonLabel = "Setup Desktop App";
  if (launcherActionInFlight === "setup") {
    launcherSetupButtonLabel = "Setting up...";
  } else if (launcherInstalled) {
    launcherSetupButtonLabel = "Re-run Setup";
  }

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

  async function handleLauncherSetup() {
    setLauncherActionInFlight("setup");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    const response = await route_setup_launcher(DEFAULT_SETUP_LAUNCHER_REQUEST);
    setLauncherActionInFlight(null);
    if (!res200(response) || !response.data) {
      setLauncherActionError("Launcher setup request failed.");
      return;
    }
    const payload = response.data;
    setLauncherStatus(payload);
    if (!payload.ok) {
      setLauncherActionError(
        resolveLauncherErrorMessage(payload, "Launcher setup failed."),
      );
      return;
    }
    setLauncherStatusError(null);
    setLauncherActionMessage("Launcher setup is complete.");
  }

  async function handleLauncherRepair() {
    setLauncherActionInFlight("repair");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    const response = await route_repair_launcher(DEFAULT_LAUNCHER_REQUEST);
    setLauncherActionInFlight(null);
    if (!res200(response) || !response.data) {
      setLauncherActionError("Launcher repair request failed.");
      return;
    }
    const payload = response.data;
    setLauncherStatus(payload);
    if (!payload.ok) {
      setLauncherActionError(
        resolveLauncherErrorMessage(payload, "Launcher repair failed."),
      );
      return;
    }
    setLauncherStatusError(null);
    setLauncherActionMessage("Launcher repair is complete.");
  }

  async function handleLauncherRemove() {
    setLauncherActionInFlight("remove");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    const response = await route_remove_launcher(DEFAULT_LAUNCHER_REQUEST);
    setLauncherActionInFlight(null);
    if (!res200(response) || !response.data) {
      setLauncherActionError("Launcher removal request failed.");
      return;
    }
    const payload = response.data;
    setLauncherStatus(payload);
    if (!payload.ok) {
      setLauncherActionError(
        resolveLauncherErrorMessage(payload, "Launcher removal failed."),
      );
      return;
    }
    setLauncherStatusError(null);
    setLauncherActionMessage(
      "Launcher metadata and managed artifacts were removed.",
    );
  }

  async function handleLauncherUpdate() {
    setLauncherActionInFlight("update");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    const response = await route_update_launcher(
      DEFAULT_UPDATE_LAUNCHER_REQUEST,
    );
    setLauncherActionInFlight(null);
    if (!res200(response) || !response.data) {
      setLauncherActionError("Setta update request failed.");
      return;
    }
    const payload = response.data;
    setLauncherStatus(payload);
    if (!payload.ok) {
      setLauncherActionError(
        resolveLauncherErrorMessage(payload, "Setta update failed."),
      );
      return;
    }
    setLauncherStatusError(null);
    const fromVersion = payload.fromVersion ?? "unknown";
    const toVersion = payload.toVersion ?? "unknown";
    setLauncherActionMessage(`Setta updated: ${fromVersion} -> ${toVersion}`);
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

          <section
            className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-setta-50 p-3 dark:border-setta-700 dark:bg-setta-900/50"
            data-testid="workspace-switcher-launcher-section"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
                Desktop Launcher
              </span>
              <button
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={refreshLauncherStatus}
                disabled={launcherActionsDisabled}
              >
                {launcherActionInFlight === "refresh"
                  ? "Refreshing..."
                  : "Refresh"}
              </button>
            </div>
            <p className="text-xs text-setta-500 dark:text-setta-400">
              Install, repair, update, or remove launcher bindings directly from
              Setta.
            </p>
            {launcherStatus && (
              <div className="grid gap-1 text-xs text-setta-600 dark:text-setta-300">
                <span>
                  Status:{" "}
                  <span className="font-semibold">
                    {launcherInstalled ? "installed" : "not installed"}
                  </span>
                </span>
                {launcherStatus.channel && (
                  <span>
                    Channel:{" "}
                    <span className="font-semibold">
                      {launcherStatus.channel}
                    </span>
                  </span>
                )}
                {launcherStatus.updateCapability && (
                  <span>
                    Update capability:{" "}
                    <span className="font-semibold">
                      {launcherStatus.updateCapability}
                    </span>
                  </span>
                )}
                {launcherTarget && (
                  <span className="break-all">
                    Target:{" "}
                    <span className="font-semibold">{launcherTarget}</span>
                  </span>
                )}
                {launcherStatus.targetError && (
                  <span className="text-red-700 dark:text-red-300">
                    Target error: {launcherStatus.targetError}
                  </span>
                )}
              </div>
            )}
            {launcherStatus?.missingManagedArtifacts &&
              launcherStatus.missingManagedArtifacts.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200">
                  Missing managed artifacts:
                  <ul className="mt-1 list-disc pl-4">
                    {launcherStatus.missingManagedArtifacts.map((path) => (
                      <li key={path} className="break-all">
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            {launcherStatus?.updateGuidance && (
              <div className="rounded-md border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-800 dark:text-setta-200">
                {launcherStatus.updateGuidance}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={handleLauncherSetup}
                disabled={launcherActionsDisabled}
              >
                {launcherSetupButtonLabel}
              </button>
              <button
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={handleLauncherRepair}
                disabled={launcherActionsDisabled || !launcherInstalled}
              >
                {launcherActionInFlight === "repair"
                  ? "Repairing..."
                  : "Repair Desktop App"}
              </button>
              <button
                className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={handleLauncherUpdate}
                disabled={launcherActionsDisabled || !canUpdateInApp}
              >
                {launcherActionInFlight === "update"
                  ? "Updating..."
                  : "Update Setta"}
              </button>
              <button
                className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                onClick={handleLauncherRemove}
                disabled={launcherActionsDisabled || !launcherInstalled}
              >
                {launcherActionInFlight === "remove"
                  ? "Removing..."
                  : "Remove Desktop App"}
              </button>
            </div>
            {launcherStatusError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
                {launcherStatusError}
              </div>
            )}
            {launcherActionError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
                {launcherActionError}
              </div>
            )}
            {launcherActionMessage && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-200">
                {launcherActionMessage}
              </div>
            )}
          </section>

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
