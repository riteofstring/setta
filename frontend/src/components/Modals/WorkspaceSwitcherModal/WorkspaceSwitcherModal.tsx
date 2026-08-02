import * as Dialog from "@radix-ui/react-dialog";
import {
  callOpenAPI,
  getErrorDetail,
  res200,
  resolveServerModeCapabilities,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { DesktopLauncherSettingsSection } from "components/Launcher/DesktopLauncherSettingsSection";
import {
  createWorkspaceLaunchIntent,
  getSettaHomeInfo,
  type HttpapiCreateWorkspaceLaunchIntentResponse as CreateWorkspaceLaunchIntentResponse,
  type HttpapiLaunchRequest as LaunchRequest,
  type HttpapiSettaHomeInfoResponse as SettaHomeInfoResponse,
} from "openapi/http";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { closeModal } from "state/actions/modal";
import { useServerMode } from "state/definitions";
import { WORKSPACE_LAUNCH_ROUTER_PATH } from "utils/constants";
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
  readWorkspaceSwitcherDraft,
  writePendingWorkspaceLaunch,
  writeWorkspaceSwitcherDraft,
  type PendingWorkspaceLaunch,
} from "utils/workspaceSwitcherLaunch";

type CreatePendingWorkspaceLaunchResult =
  | {
      ok: true;
      pendingLaunch: PendingWorkspaceLaunch;
    }
  | {
      ok: false;
      message: string;
    };

type CreateWorkspaceLaunchIntentRouteResponse =
  ResponseDataAndStatus<CreateWorkspaceLaunchIntentResponse>;
type SettaHomeInfoRouteResponse = ResponseDataAndStatus<SettaHomeInfoResponse>;

type WorkspaceSwitcherFormState = {
  workspaceRoot: string;
  sshTarget: string;
  settaFilesLocation: SettaFilesLocation;
  sshArgs: string;
  remoteCmd: string;
  localPort: string;
};

type UpdateWorkspaceSwitcherForm = (
  patch: Partial<WorkspaceSwitcherFormState>,
) => void;

type CreateWorkspaceLaunchRequestResult =
  | {
      ok: true;
      request: LaunchRequest;
    }
  | {
      ok: false;
      message: string;
    };

type ParseLocalTunnelPortResult =
  | {
      ok: true;
      localPort?: number;
    }
  | {
      ok: false;
      message: string;
    };

const FIELD_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-[0.2em] text-setta-400";
const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100";
const DEFAULT_GLOBAL_BASE_LABEL = "<global_setta_files_base>";

function resolveLaunchIntentRouteErrorMessage(
  response: CreateWorkspaceLaunchIntentRouteResponse,
): string {
  const detail = getErrorDetail(response.data);
  if (detail) {
    return detail;
  }
  if (response.status) {
    return `Failed to prepare launch intent (HTTP ${response.status}).`;
  }
  return "Failed to prepare launch intent.";
}

function buildPendingWorkspaceLaunch(params: {
  launchIntentToken: string;
  launchRequest: LaunchRequest;
  requestedAt?: number;
  returnUrl: string;
}): PendingWorkspaceLaunch {
  const { launchIntentToken, launchRequest, requestedAt, returnUrl } = params;
  return {
    request: {
      launchIntentToken,
    },
    returnUrl,
    requestedAt: requestedAt ?? Date.now(),
    sshTarget: launchRequest.sshTarget ?? null,
    settaFilesLocation: launchRequest.settaFilesLocation ?? null,
  };
}

async function createPendingWorkspaceLaunchFromIntent({
  launchRequest,
  returnUrl,
}: {
  launchRequest: LaunchRequest;
  returnUrl: string;
}): Promise<CreatePendingWorkspaceLaunchResult> {
  const response = (await callOpenAPI(
    createWorkspaceLaunchIntent({
      body: {
        launchRequest,
        returnUrl,
      },
    } as Parameters<typeof createWorkspaceLaunchIntent>[0]),
  )) as CreateWorkspaceLaunchIntentRouteResponse;
  if (!res200(response) || !response.data) {
    return {
      ok: false,
      message: resolveLaunchIntentRouteErrorMessage(response),
    };
  }
  if (!response.data.ok || !response.data.launchIntentToken) {
    return {
      ok: false,
      message:
        response.data.error?.message ??
        "Failed to prepare launch intent for workspace switch.",
    };
  }
  return {
    ok: true,
    pendingLaunch: buildPendingWorkspaceLaunch({
      launchIntentToken: response.data.launchIntentToken,
      launchRequest,
      requestedAt: response.data.requestedAt,
      returnUrl,
    }),
  };
}

function readDraftString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readDraftLocalPort(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function readInitialWorkspaceSwitcherFormState(): WorkspaceSwitcherFormState {
  const draft = readWorkspaceSwitcherDraft();
  return {
    workspaceRoot: readDraftString(draft?.workspaceRoot),
    sshTarget: readDraftString(draft?.sshTarget),
    settaFilesLocation: normalizeSettaFilesLocation(draft?.settaFilesLocation),
    sshArgs: readDraftString(draft?.sshArgs),
    remoteCmd: readDraftString(draft?.remoteCmd),
    localPort: readDraftLocalPort(draft?.localPort),
  };
}

function createHistorySelectionFormState(
  entry: WorkspaceHistoryEntry,
): WorkspaceSwitcherFormState {
  return {
    workspaceRoot: entry.workspaceRoot,
    sshTarget: entry.sshTarget ?? "",
    settaFilesLocation: entry.settaFilesLocation,
    sshArgs: "",
    remoteCmd: "",
    localPort: entry.localPort ? String(entry.localPort) : "",
  };
}

function sortWorkspaceHistory(
  history: WorkspaceHistoryEntry[],
): WorkspaceHistoryEntry[] {
  return [...history].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

function resolveGlobalBaseLabel(params: {
  sshTarget: string;
  globalSettaFilesBase?: string | null;
}): string {
  if (params.sshTarget.trim()) {
    return "remote Setta home";
  }
  if (params.globalSettaFilesBase) {
    return params.globalSettaFilesBase;
  }
  return DEFAULT_GLOBAL_BASE_LABEL;
}

function parseLocalTunnelPort(
  localPortInput: string,
): ParseLocalTunnelPortResult {
  const trimmedLocalPort = localPortInput.trim();
  if (!trimmedLocalPort) {
    return {
      ok: true,
    };
  }
  const parsed = Number(trimmedLocalPort);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return {
      ok: false,
      message: "Local port must be a whole number.",
    };
  }
  if (parsed < 1 || parsed > 65535) {
    return {
      ok: false,
      message: "Local port must be between 1 and 65535.",
    };
  }
  return {
    ok: true,
    localPort: parsed,
  };
}

function createWorkspaceLaunchRequestFromFormState(
  formState: WorkspaceSwitcherFormState,
): CreateWorkspaceLaunchRequestResult {
  const workspaceRoot = formState.workspaceRoot.trim();
  if (!workspaceRoot) {
    return {
      ok: false,
      message: "Enter a workspace path to continue.",
    };
  }
  const localPortResult = parseLocalTunnelPort(formState.localPort);
  if (!localPortResult.ok) {
    return localPortResult;
  }
  const sshTarget = formState.sshTarget.trim();
  const sshArgs = formState.sshArgs.trim();
  const remoteCmd = formState.remoteCmd.trim();
  return {
    ok: true,
    request: {
      workspaceRoot,
      settaFilesLocation: formState.settaFilesLocation,
      ...(sshTarget ? { sshTarget } : {}),
      ...(sshArgs ? { sshArgs } : {}),
      ...(remoteCmd ? { remoteCmd } : {}),
      ...(localPortResult.localPort !== undefined
        ? { localPort: localPortResult.localPort }
        : {}),
    },
  };
}

function resolveWorkspaceLaunchReturnUrl(): string {
  return typeof window !== "undefined" ? window.location.href : "/";
}

function useLauncherSettaHomeInfo(
  canManageDesktopLauncher: boolean,
  modeResolved: boolean,
) {
  const [launcherSettaHomeInfo, setLauncherSettaHomeInfo] =
    useState<SettaHomeInfoResponse | null>(null);
  const [launcherSettaHomeInfoError, setLauncherSettaHomeInfoError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!modeResolved) {
      return;
    }
    let isMounted = true;
    async function hydrateLauncherSettaHomeInfo() {
      if (!canManageDesktopLauncher) {
        setLauncherSettaHomeInfo(null);
        setLauncherSettaHomeInfoError(null);
        return;
      }
      const response = (await callOpenAPI(
        getSettaHomeInfo(),
      )) as SettaHomeInfoRouteResponse;
      if (!isMounted) {
        return;
      }
      if (!res200(response) || !response.data) {
        setLauncherSettaHomeInfoError(
          "Failed to resolve launcher scope for desktop launcher actions.",
        );
        return;
      }
      setLauncherSettaHomeInfoError(null);
      setLauncherSettaHomeInfo(response.data);
    }

    void hydrateLauncherSettaHomeInfo();
    return () => {
      isMounted = false;
    };
  }, [canManageDesktopLauncher, modeResolved]);

  return {
    launcherSettaHomeInfo,
    launcherSettaHomeInfoError,
  };
}

function WorkspacePathField(props: {
  workspaceRoot: string;
  onFieldChange: UpdateWorkspaceSwitcherForm;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className={FIELD_LABEL_CLASS}>Workspace Path</label>
      <input
        className={TEXT_INPUT_CLASS}
        placeholder="/path/to/workspace"
        value={props.workspaceRoot}
        onChange={(event) => {
          props.onFieldChange({
            workspaceRoot: event.target.value,
          });
        }}
        spellCheck={false}
      />
    </div>
  );
}

function SshTargetField(props: {
  sshTarget: string;
  onFieldChange: UpdateWorkspaceSwitcherForm;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className={FIELD_LABEL_CLASS}>SSH Target (Optional)</label>
      <input
        className={TEXT_INPUT_CLASS}
        placeholder="user@host"
        value={props.sshTarget}
        onChange={(event) => {
          props.onFieldChange({
            sshTarget: event.target.value,
          });
        }}
        spellCheck={false}
      />
      <p className="text-xs text-setta-500 dark:text-setta-400">
        Leave blank for local workspaces. When set, Setta will start (or reuse)
        a remote session and open a local tunnel.
      </p>
    </div>
  );
}

function RemoteWorkspaceFields(props: {
  sshArgs: string;
  remoteCmd: string;
  localPort: string;
  onFieldChange: UpdateWorkspaceSwitcherForm;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2">
        <label className={FIELD_LABEL_CLASS}>SSH Args (Optional)</label>
        <input
          className={TEXT_INPUT_CLASS}
          placeholder="-i ~/.ssh/id_ed25519 -J user@jump"
          value={props.sshArgs}
          onChange={(event) => {
            props.onFieldChange({
              sshArgs: event.target.value,
            });
          }}
          spellCheck={false}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className={FIELD_LABEL_CLASS}>Remote Cmd (Optional)</label>
        <input
          className={TEXT_INPUT_CLASS}
          placeholder="source .venv/bin/activate && setta"
          value={props.remoteCmd}
          onChange={(event) => {
            props.onFieldChange({
              remoteCmd: event.target.value,
            });
          }}
          spellCheck={false}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className={FIELD_LABEL_CLASS}>
          Local Tunnel Port (Optional)
        </label>
        <input
          className={TEXT_INPUT_CLASS}
          placeholder="61000"
          value={props.localPort}
          onChange={(event) => {
            props.onFieldChange({
              localPort: event.target.value,
            });
          }}
          spellCheck={false}
          inputMode="numeric"
        />
      </div>
    </div>
  );
}

function SettaFilesLocationField(props: {
  globalBaseLabel: string;
  settaFilesLocation: SettaFilesLocation;
  sshTarget: string;
  onFieldChange: UpdateWorkspaceSwitcherForm;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="setta-files-location" className={FIELD_LABEL_CLASS}>
        Setta Files Location
      </label>
      <select
        id="setta-files-location"
        aria-label="Setta Files Location"
        className={TEXT_INPUT_CLASS}
        value={props.settaFilesLocation}
        onChange={(event) => {
          props.onFieldChange({
            settaFilesLocation: normalizeSettaFilesLocation(event.target.value),
          });
        }}
      >
        <option value="auto">Default (auto)</option>
        <option value="local">Local (workspace)</option>
        <option value="global">Global ({props.globalBaseLabel})</option>
      </select>
      <p className="text-xs text-setta-500 dark:text-setta-400">
        If the workspace already has a local{" "}
        <span className="font-semibold">setta_files/</span>, Setta will use it
        even when Global is selected.
        {props.sshTarget.trim()
          ? " For SSH targets, Global refers to the remote machine's Setta home."
          : null}
      </p>
    </div>
  );
}

function RecentWorkspacesSection(props: {
  history: WorkspaceHistoryEntry[];
  onClearHistory: () => void;
  onSelectHistory: (entry: WorkspaceHistoryEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-setta-50 p-3 dark:border-setta-700 dark:bg-setta-900/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
          Recent Workspaces
        </span>
        <button
          className="text-[10px] font-semibold uppercase tracking-[0.2em] text-setta-500 hover:text-setta-700 dark:text-setta-300"
          onClick={props.onClearHistory}
        >
          Clear
        </button>
      </div>
      <div className="grid gap-2">
        {props.history.map((entry) => (
          <button
            key={workspaceHistoryEntryKey(entry)}
            className="flex flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left text-sm text-setta-700 transition hover:border-setta-200 hover:bg-white dark:text-setta-200 dark:hover:border-setta-700 dark:hover:bg-setta-800"
            onClick={() => props.onSelectHistory(entry)}
          >
            <span className="truncate font-medium">{entry.workspaceRoot}</span>
            <span className="truncate text-[11px] text-setta-500 dark:text-setta-400">
              Setta files: {entry.settaFilesLocation}
            </span>
            {entry.sshTarget ? (
              <span className="truncate text-[11px] text-setta-500 dark:text-setta-400">
                SSH: {entry.sshTarget}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceSwitcherFormBody(props: {
  canManageDesktopLauncher: boolean;
  globalBaseLabel: string;
  history: WorkspaceHistoryEntry[];
  launcherSettaHomeInfo: SettaHomeInfoResponse | null;
  launcherSettaHomeInfoError: string | null;
  formState: WorkspaceSwitcherFormState;
  onClearHistory: () => void;
  onFieldChange: UpdateWorkspaceSwitcherForm;
  onSelectHistory: (entry: WorkspaceHistoryEntry) => void;
}) {
  const showRemoteFields = props.formState.sshTarget.trim().length > 0;
  return (
    <div className="flex flex-col gap-4">
      <WorkspacePathField
        workspaceRoot={props.formState.workspaceRoot}
        onFieldChange={props.onFieldChange}
      />
      <SshTargetField
        sshTarget={props.formState.sshTarget}
        onFieldChange={props.onFieldChange}
      />
      {showRemoteFields ? (
        <RemoteWorkspaceFields
          sshArgs={props.formState.sshArgs}
          remoteCmd={props.formState.remoteCmd}
          localPort={props.formState.localPort}
          onFieldChange={props.onFieldChange}
        />
      ) : null}
      <SettaFilesLocationField
        globalBaseLabel={props.globalBaseLabel}
        settaFilesLocation={props.formState.settaFilesLocation}
        sshTarget={props.formState.sshTarget}
        onFieldChange={props.onFieldChange}
      />
      {props.canManageDesktopLauncher ? (
        <DesktopLauncherSettingsSection
          settaHome={props.launcherSettaHomeInfo?.settaHome ?? null}
          requireSettaHome={true}
          missingSettaHomeMessage={
            props.launcherSettaHomeInfoError ??
            "Resolving launcher scope for desktop launcher actions."
          }
        />
      ) : null}
      {props.history.length > 0 ? (
        <RecentWorkspacesSection
          history={props.history}
          onClearHistory={props.onClearHistory}
          onSelectHistory={props.onSelectHistory}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSwitcherFooter(props: {
  canLaunch: boolean;
  isLaunching: boolean;
  onLaunch: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-setta-200 pt-4 dark:border-setta-700">
      <button
        className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-sm text-setta-700 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={closeModal}
      >
        Cancel
      </button>
      <button
        className="cursor-pointer rounded-full bg-setta-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-setta-800 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-setta-600"
        onClick={props.onLaunch}
        disabled={!props.canLaunch}
      >
        {props.isLaunching ? "Launching..." : "Launch"}
      </button>
    </div>
  );
}

export function WorkspaceSwitcherModal() {
  const navigate = useNavigate();
  const serverMode = useServerMode((state) => state.mode);
  const modeResolved = useServerMode((state) => state.modeResolved);
  const canManageDesktopLauncher =
    resolveServerModeCapabilities(serverMode).canManageDesktopLauncher;
  const [formState, setFormState] = useState<WorkspaceSwitcherFormState>(
    readInitialWorkspaceSwitcherFormState,
  );
  const [history, setHistory] =
    useState<WorkspaceHistoryEntry[]>(loadWorkspaceHistory);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const { launcherSettaHomeInfo, launcherSettaHomeInfoError } =
    useLauncherSettaHomeInfo(canManageDesktopLauncher, modeResolved);

  const orderedHistory = useMemo(
    () => sortWorkspaceHistory(history),
    [history],
  );
  const canLaunch = formState.workspaceRoot.trim().length > 0 && !isLaunching;
  const globalBaseLabel = resolveGlobalBaseLabel({
    sshTarget: formState.sshTarget,
    globalSettaFilesBase: launcherSettaHomeInfo?.globalSettaFilesBase,
  });

  function updateFormState(patch: Partial<WorkspaceSwitcherFormState>) {
    setFormState((current) => ({
      ...current,
      ...patch,
    }));
  }

  function handleSelectHistory(entry: WorkspaceHistoryEntry) {
    setFormState(createHistorySelectionFormState(entry));
    setError(null);
  }

  function handleClearHistory() {
    setHistory([]);
    saveWorkspaceHistory([]);
  }

  async function handleLaunch() {
    setError(null);
    const requestResult = createWorkspaceLaunchRequestFromFormState(formState);
    if (!requestResult.ok) {
      setError(requestResult.message);
      return;
    }

    setIsLaunching(true);
    writeWorkspaceSwitcherDraft(requestResult.request);
    const pendingLaunchResult = await createPendingWorkspaceLaunchFromIntent({
      launchRequest: requestResult.request,
      returnUrl: resolveWorkspaceLaunchReturnUrl(),
    });
    if (!pendingLaunchResult.ok) {
      setError(pendingLaunchResult.message);
      setIsLaunching(false);
      return;
    }

    writePendingWorkspaceLaunch(pendingLaunchResult.pendingLaunch);
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
        <WorkspaceSwitcherFormBody
          canManageDesktopLauncher={canManageDesktopLauncher}
          globalBaseLabel={globalBaseLabel}
          history={orderedHistory}
          launcherSettaHomeInfo={launcherSettaHomeInfo}
          launcherSettaHomeInfoError={launcherSettaHomeInfoError}
          formState={formState}
          onClearHistory={handleClearHistory}
          onFieldChange={updateFormState}
          onSelectHistory={handleSelectHistory}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <WorkspaceSwitcherFooter
        canLaunch={canLaunch}
        isLaunching={isLaunching}
        onLaunch={handleLaunch}
      />
    </div>
  );
}
