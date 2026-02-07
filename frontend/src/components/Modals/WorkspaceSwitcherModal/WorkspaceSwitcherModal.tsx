import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { closeModal } from "state/actions/modal";
import { res200 } from "utils/endpointUtils";
import { route_launch } from "utils/generatedEndpoints";

type WorkspaceHistoryEntry = {
  workspaceRoot: string;
  sshTarget: string | null;
  sshArgs: string | null;
  remoteCmd: string | null;
  localPort: number | null;
  filesRoot: string | null;
  filesRootBase: string | null;
  lastUsedAt: number;
};

const HISTORY_KEY = "setta.workspaceHistory";
const HISTORY_LIMIT = 6;
const WINDOW_NAME_PREFIX = "setta.workspaceHistory:";

function loadHistory(): WorkspaceHistoryEntry[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.workspaceRoot === "string" &&
        typeof entry.lastUsedAt === "number",
    );
  } catch (error) {
    console.warn("Failed to read workspace history", error);
    return [];
  }
}

function readWindowHistory(): WorkspaceHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  const rawName = window.name;
  if (!rawName || !rawName.startsWith(WINDOW_NAME_PREFIX)) {
    return [];
  }
  const raw = rawName.slice(WINDOW_NAME_PREFIX.length);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.workspaceRoot === "string" &&
        typeof entry.lastUsedAt === "number",
    );
  } catch (error) {
    console.warn("Failed to read workspace history from window.name", error);
    return [];
  }
}

function writeWindowHistory(entries: WorkspaceHistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.name = `${WINDOW_NAME_PREFIX}${JSON.stringify(entries)}`;
  } catch (error) {
    console.warn("Failed to write workspace history to window.name", error);
  }
}

function saveHistory(entries: WorkspaceHistoryEntry[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Failed to save workspace history", error);
  }
}

function buildEntryKey(entry: {
  workspaceRoot: string;
  sshTarget: string | null;
  sshArgs: string | null;
  remoteCmd: string | null;
  localPort: number | null;
  filesRoot: string | null;
  filesRootBase: string | null;
}) {
  return `${entry.workspaceRoot}::${entry.sshTarget ?? ""}::${entry.sshArgs ?? ""}::${entry.remoteCmd ?? ""}::${entry.localPort ?? ""}::${entry.filesRoot ?? ""}::${entry.filesRootBase ?? ""}`;
}

function mergeHistory(
  incoming: WorkspaceHistoryEntry[],
  existing: WorkspaceHistoryEntry[],
) {
  const seen = new Set<string>();
  const merged: WorkspaceHistoryEntry[] = [];
  for (const entry of [...incoming, ...existing]) {
    const key = buildEntryKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }
  return merged
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, HISTORY_LIMIT);
}

function hydrateHistoryFromWindowName() {
  const windowHistory = readWindowHistory();
  if (windowHistory.length === 0) {
    return;
  }
  const merged = mergeHistory(windowHistory, loadHistory());
  saveHistory(merged);
  try {
    window.name = "";
  } catch (error) {
    console.warn("Failed to clear workspace history from window.name", error);
  }
}

hydrateHistoryFromWindowName();

export function WorkspaceSwitcherModal() {
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [sshArgs, setSshArgs] = useState("");
  const [remoteCmd, setRemoteCmd] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [filesRoot, setFilesRoot] = useState("");
  const [filesRootBase, setFilesRootBase] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [history, setHistory] = useState<WorkspaceHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const inputClassName =
    "w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100";

  const trimmedWorkspace = workspaceRoot.trim();
  const trimmedSshTarget = sshTarget.trim();
  const trimmedSshArgs = sshArgs.trim();
  const trimmedRemoteCmd = remoteCmd.trim();
  const trimmedLocalPort = localPort.trim();
  const trimmedFilesRoot = filesRoot.trim();
  const trimmedFilesRootBase = filesRootBase.trim();
  const canLaunch = trimmedWorkspace.length > 0 && !isLaunching;

  const orderedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }, [history]);

  function onSelectHistory(entry: WorkspaceHistoryEntry) {
    setWorkspaceRoot(entry.workspaceRoot);
    setSshTarget(entry.sshTarget ?? "");
    setSshArgs(entry.sshArgs ?? "");
    setRemoteCmd(entry.remoteCmd ?? "");
    setLocalPort(entry.localPort ? String(entry.localPort) : "");
    setFilesRoot(entry.filesRoot ?? "");
    setFilesRootBase(entry.filesRootBase ?? "");
    setShowAdvanced(
      Boolean(
        entry.sshArgs ||
          entry.remoteCmd ||
          entry.localPort ||
          entry.filesRoot ||
          entry.filesRootBase,
      ),
    );
    setError(null);
  }

  function updateHistory(nextEntry: WorkspaceHistoryEntry) {
    const nextKey = buildEntryKey(nextEntry);
    const deduped = history.filter((entry) => buildEntryKey(entry) !== nextKey);
    const nextHistory = [nextEntry, ...deduped].slice(0, HISTORY_LIMIT);
    setHistory(nextHistory);
    saveHistory(nextHistory);
    return nextHistory;
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
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
    try {
      const res = await route_launch({
        workspaceRoot: trimmedWorkspace,
        sshTarget: trimmedSshTarget || undefined,
        sshArgs: trimmedSshArgs || undefined,
        remoteCmd: trimmedRemoteCmd || undefined,
        localPort: parsedLocalPort,
        filesRoot: trimmedFilesRoot || undefined,
        filesRootBase: trimmedFilesRootBase || undefined,
      });
      if (!res200(res) || !res.data) {
        setError("Launch failed. Please try again.");
        return;
      }
      if (!res.data.ok) {
        setError(res.data.error?.message ?? "Launch failed.");
        return;
      }
      if (!res.data.bootstrapUrlFragment) {
        setError("Launch succeeded but no bootstrap URL was returned.");
        return;
      }
      const nextHistory = updateHistory({
        workspaceRoot: trimmedWorkspace,
        sshTarget: trimmedSshTarget || null,
        sshArgs: trimmedSshArgs || null,
        remoteCmd: trimmedRemoteCmd || null,
        localPort: parsedLocalPort ?? null,
        filesRoot: trimmedFilesRoot || null,
        filesRootBase: trimmedFilesRootBase || null,
        lastUsedAt: Date.now(),
      });
      writeWindowHistory(nextHistory);
      window.location.href = res.data.bootstrapUrlFragment;
    } finally {
      setIsLaunching(false);
    }
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

      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
          Workspace Path
        </label>
        <input
          className={inputClassName}
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
          className={inputClassName}
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

      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
        <span>Advanced Paths</span>
        <button
          className="rounded-full border border-setta-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? "Hide" : "Show"}
        </button>
      </div>

      {showAdvanced && (
        <div className="grid gap-3">
          {trimmedSshTarget.length > 0 && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
                  SSH Args (Optional)
                </label>
                <input
                  className={inputClassName}
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
                  className={inputClassName}
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
                  className={inputClassName}
                  placeholder="61000"
                  value={localPort}
                  onChange={(event) => setLocalPort(event.target.value)}
                  spellCheck={false}
                  inputMode="numeric"
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
              Files Root (Optional)
            </label>
            <input
              className={inputClassName}
              placeholder="/path/to/setta_files"
              value={filesRoot}
              onChange={(event) => setFilesRoot(event.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
              Files Root Base (Optional)
            </label>
            <input
              className={inputClassName}
              placeholder="/path/to/setta_state"
              value={filesRootBase}
              onChange={(event) => setFilesRootBase(event.target.value)}
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Files root overrides the base when both are provided.
          </p>
        </div>
      )}

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
                key={buildEntryKey(entry)}
                className="flex flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left text-sm text-setta-700 transition hover:border-setta-200 hover:bg-white dark:text-setta-200 dark:hover:border-setta-700 dark:hover:bg-setta-800"
                onClick={() => onSelectHistory(entry)}
              >
                <span className="truncate font-medium">
                  {entry.workspaceRoot}
                </span>
                {(entry.filesRoot || entry.filesRootBase) && (
                  <span className="truncate text-[11px] text-setta-500 dark:text-setta-400">
                    {entry.filesRoot
                      ? `Files root: ${entry.filesRoot}`
                      : `Files base: ${entry.filesRootBase}`}
                  </span>
                )}
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

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="mt-auto flex justify-end gap-2 border-t border-setta-200 pt-4 dark:border-setta-700">
        <button
          className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-sm text-setta-700 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={closeModal}
        >
          Cancel
        </button>
        <button
          className="cursor-pointer rounded-full bg-setta-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-blue-700"
          onClick={handleLaunch}
          disabled={!canLaunch}
        >
          {isLaunching ? "Launching..." : "Launch"}
        </button>
      </div>
    </div>
  );
}
