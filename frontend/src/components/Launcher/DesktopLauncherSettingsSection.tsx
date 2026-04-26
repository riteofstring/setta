import {
  getLauncherStatus,
  removeLauncher,
  repairLauncher,
  setupLauncher,
  updateLauncher,
  type GetLauncherStatusResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback, useEffect, useMemo, useState } from "react";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
type LauncherRequestBase = NonNullable<
  Parameters<typeof removeLauncher>[0]
>["body"];
type SetupLauncherRequest = NonNullable<
  Parameters<typeof setupLauncher>[0]
>["body"];
type UpdateLauncherRequest = NonNullable<
  Parameters<typeof updateLauncher>[0]
>["body"];
type LauncherStatusResponse = GetLauncherStatusResponse;
type LauncherActionState =
  | "refresh"
  | "setup"
  | "repair"
  | "remove"
  | "update"
  | null;
type LauncherUpdateStage =
  | "idle"
  | "checking"
  | "downloading"
  | "rebinding"
  | "done"
  | "failed";
type LauncherControlsState = {
  launcherInstalled: boolean;
  canUpdateInApp: boolean;
  installerManagedChannel: boolean;
  launcherActionsDisabled: boolean;
  launcherSetupButtonLabel: string;
};
type LauncherUpdatePreflightResult =
  | { kind: "ready" }
  | {
      kind: "error";
      errorMessage: string;
      showInstallerInstructions: boolean;
    };
type LauncherStatusRouteResponse =
  ResponseDataAndStatus<LauncherStatusResponse>;
type LauncherUpdateRouteResponse =
  ResponseDataAndStatus<LauncherUpdateResponse>;
type DesktopLauncherSettingsSectionProps = {
  settaHome?: string | null;
  requireSettaHome?: boolean;
  missingSettaHomeMessage?: string;
};
function normalizeLauncherScopeSettaHome(
  settaHome: string | null | undefined,
): string | null {
  if (settaHome === null || settaHome === undefined) {
    return null;
  }
  const trimmedSettaHome = settaHome.trim();
  if (!trimmedSettaHome) {
    return null;
  }
  return trimmedSettaHome;
}
function buildLauncherRequestBase(
  settaHome: string | null,
): LauncherRequestBase {
  return { settaHome };
}
function buildSetupLauncherRequest(
  settaHome: string | null,
  launcherStatus: LauncherStatusResponse | null,
): SetupLauncherRequest {
  const request: SetupLauncherRequest = {};
  if (settaHome !== null) {
    request.settaHome = settaHome;
  }
  if (!launcherStatus || launcherStatus.installed !== true) {
    return request;
  }
  request.installArtifacts =
    Object.keys(launcherStatus.managedArtifacts ?? {}).length > 0;
  if (launcherStatus.channel) {
    request.channel = launcherStatus.channel;
  }
  if (launcherStatus.openMode) {
    request.openMode = launcherStatus.openMode;
  }
  if (launcherStatus.workspaceBehavior) {
    request.workspaceBehavior = launcherStatus.workspaceBehavior;
  }
  if (launcherStatus.artifactOptions) {
    request.artifactOptions = { ...launcherStatus.artifactOptions };
  }
  return request;
}
function buildUpdateLauncherRequest(
  settaHome: string | null,
): UpdateLauncherRequest {
  return { settaHome };
}
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
function detectOperatingSystem(
  userAgentOverride?: string | null,
): "macos" | "windows" | "linux" {
  const userAgent =
    userAgentOverride ??
    (typeof window !== "undefined" ? window.navigator.userAgent : "");
  const lowerCasedUserAgent = userAgent.toLowerCase();
  if (lowerCasedUserAgent.includes("mac")) {
    return "macos";
  }
  if (lowerCasedUserAgent.includes("win")) {
    return "windows";
  }
  return "linux";
}
function resolveInstallerInstructionsForUserAgent(
  userAgentOverride?: string | null,
): Array<string> {
  const os = detectOperatingSystem(userAgentOverride);
  if (os === "macos") {
    return [
      "Download the latest Setta macOS installer package.",
      "Run the installer again to update launcher bindings.",
      "Reopen Setta from Applications.",
    ];
  }
  if (os === "windows") {
    return [
      "Download the latest Setta Windows installer package.",
      "Run the installer in upgrade mode.",
      "Launch Setta again from Start Menu.",
    ];
  }
  return [
    "Download the latest Setta Linux package or rerun your install script.",
    "Complete the package upgrade for your distro/channel.",
    "Launch Setta again from your desktop entry.",
  ];
}
function deriveLauncherControlsState({
  launcherStatus,
  launcherActionInFlight,
}: {
  launcherStatus: LauncherStatusResponse | null;
  launcherActionInFlight: LauncherActionState;
}): LauncherControlsState {
  const launcherInstalled = launcherStatus?.installed === true;
  const canUpdateInApp =
    launcherInstalled && launcherStatus?.updateCapability === "in_app";
  const installerManagedChannel =
    launcherInstalled &&
    launcherStatus?.updateCapability === "installer_managed";
  const launcherActionsDisabled = launcherActionInFlight !== null;
  let launcherSetupButtonLabel = "Setup Desktop App";
  if (launcherActionInFlight === "setup") {
    launcherSetupButtonLabel = "Setting up...";
  } else if (launcherInstalled) {
    launcherSetupButtonLabel = "Re-run Setup";
  }
  return {
    launcherInstalled,
    canUpdateInApp,
    installerManagedChannel,
    launcherActionsDisabled,
    launcherSetupButtonLabel,
  };
}
function resolveUpdateProgressLabel(
  updateStage: LauncherUpdateStage,
): string | null {
  if (updateStage === "checking") {
    return "Update progress: checking";
  }
  if (updateStage === "downloading") {
    return "Update progress: downloading/installing";
  }
  if (updateStage === "rebinding") {
    return "Update progress: rebinding";
  }
  if (updateStage === "done") {
    return "Update progress: done";
  }
  if (updateStage === "failed") {
    return "Update progress: failed";
  }
  return null;
}
function resolveLauncherUpdatePreflight(
  launcherStatus: LauncherStatusResponse,
): LauncherUpdatePreflightResult {
  if (!launcherStatus.ok) {
    return {
      kind: "error",
      errorMessage: resolveLauncherErrorMessage(
        launcherStatus,
        "Launcher update capability check failed.",
      ),
      showInstallerInstructions: false,
    };
  }
  if (launcherStatus.updateCapability === "in_app") {
    return { kind: "ready" };
  }
  return {
    kind: "error",
    errorMessage:
      launcherStatus.updateGuidance ?? "In-app launcher update is unavailable.",
    showInstallerInstructions:
      launcherStatus.updateCapability === "installer_managed",
  };
}

function applySuccessfulLauncherStatusRefresh({
  launcherStatus,
  setLauncherStatus,
  setLauncherStatusError,
}: {
  launcherStatus: LauncherStatusResponse | null;
  setLauncherStatus: (value: LauncherStatusResponse | null) => void;
  setLauncherStatusError: (value: string | null) => void;
}) {
  if (!launcherStatus?.ok) {
    return;
  }
  setLauncherStatus(launcherStatus);
  setLauncherStatusError(null);
}

function LauncherStatusSummary({
  launcherStatus,
  launcherInstalled,
  launcherTarget,
}: {
  launcherStatus: LauncherStatusResponse | null;
  launcherInstalled: boolean;
  launcherTarget: string | null;
}) {
  if (!launcherStatus) {
    return null;
  }
  return (
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
          <span className="font-semibold">{launcherStatus.channel}</span>
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
          Target: <span className="font-semibold">{launcherTarget}</span>
        </span>
      )}
      {launcherStatus.targetError && (
        <span className="text-red-700 dark:text-red-300">
          Target error: {launcherStatus.targetError}
        </span>
      )}
    </div>
  );
}

function LauncherArtifactsPanels({
  launcherStatus,
}: {
  launcherStatus: LauncherStatusResponse | null;
}) {
  const managedArtifacts = Object.entries(
    launcherStatus?.managedArtifacts ?? {},
  );
  const missingManagedArtifacts = launcherStatus?.missingManagedArtifacts ?? [];
  return (
    <>
      {managedArtifacts.length > 0 && (
        <div className="rounded-md border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-800 dark:text-setta-200">
          <p className="font-semibold">Managed artifacts</p>
          <ul className="mt-1 list-disc pl-4">
            {managedArtifacts.map(([name, path]) => (
              <li key={name} className="break-all">
                <span className="font-semibold">{name}</span>: {path}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missingManagedArtifacts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200">
          Missing managed artifacts:
          <ul className="mt-1 list-disc pl-4">
            {missingManagedArtifacts.map((path) => (
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
    </>
  );
}

function LauncherActionButtons({
  launcherControlsDisabled,
  launcherInstalled,
  launcherActionInFlight,
  launcherSetupButtonLabel,
  canUpdateInApp,
  installerManagedChannel,
  showInstallerInstructions,
  onSetup,
  onRepair,
  onUpdate,
  onRemove,
  onToggleInstallerInstructions,
}: {
  launcherControlsDisabled: boolean;
  launcherInstalled: boolean;
  launcherActionInFlight: LauncherActionState;
  launcherSetupButtonLabel: string;
  canUpdateInApp: boolean;
  installerManagedChannel: boolean;
  showInstallerInstructions: boolean;
  onSetup: () => void | Promise<void>;
  onRepair: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;
  onRemove: () => void | Promise<void>;
  onToggleInstallerInstructions: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={onSetup}
        disabled={launcherControlsDisabled}
      >
        {launcherSetupButtonLabel}
      </button>
      <button
        className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={onRepair}
        disabled={launcherControlsDisabled || !launcherInstalled}
      >
        {launcherActionInFlight === "repair"
          ? "Repairing..."
          : "Repair Desktop App"}
      </button>
      {canUpdateInApp && (
        <button
          className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={onUpdate}
          disabled={launcherControlsDisabled}
        >
          {launcherActionInFlight === "update" ? "Updating..." : "Update Setta"}
        </button>
      )}
      {installerManagedChannel && (
        <button
          className="rounded-full border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
          onClick={onToggleInstallerInstructions}
          disabled={launcherControlsDisabled}
        >
          {showInstallerInstructions
            ? "Hide Update Instructions"
            : "Show Update Instructions"}
        </button>
      )}
      <button
        className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
        onClick={onRemove}
        disabled={launcherControlsDisabled || !launcherInstalled}
      >
        {launcherActionInFlight === "remove"
          ? "Removing..."
          : "Remove Desktop App"}
      </button>
    </div>
  );
}

function LauncherFeedbackPanels({
  showInstallerInstructions,
  installerInstructions,
  updateProgressLabel,
  launcherStatusError,
  launcherActionError,
  launcherActionMessage,
}: {
  showInstallerInstructions: boolean;
  installerInstructions: Array<string>;
  updateProgressLabel: string | null;
  launcherStatusError: string | null;
  launcherActionError: string | null;
  launcherActionMessage: string | null;
}) {
  return (
    <>
      {showInstallerInstructions && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-900/30 dark:text-blue-200">
          <p className="font-semibold">Installer-managed update steps</p>
          <ol className="mt-1 list-decimal pl-4">
            {installerInstructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </div>
      )}
      {updateProgressLabel && (
        <div className="rounded-md border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-800 dark:text-setta-200">
          {updateProgressLabel}
        </div>
      )}
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
    </>
  );
}

export function DesktopLauncherSettingsSection({
  settaHome = null,
  requireSettaHome = false,
  missingSettaHomeMessage,
}: DesktopLauncherSettingsSectionProps) {
  const normalizedSettaHome = normalizeLauncherScopeSettaHome(settaHome);
  const missingRequiredSettaHome =
    requireSettaHome && normalizedSettaHome === null;
  const missingSettaHomeErrorMessage =
    missingSettaHomeMessage ??
    "Launcher scope is unavailable. Reload and try again.";
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
  const [updateStage, setUpdateStage] = useState<LauncherUpdateStage>("idle");
  const [showInstallerInstructions, setShowInstallerInstructions] =
    useState(false);
  const installerInstructions = useMemo(
    () => resolveInstallerInstructionsForUserAgent(),
    [],
  );
  const fetchLauncherStatus =
    useCallback(async (): Promise<LauncherStatusResponse | null> => {
      if (missingRequiredSettaHome) {
        return null;
      }
      const response = (await callOpenAPI(
        getLauncherStatus({
          query: { setta_home: normalizedSettaHome ?? undefined },
        } as Parameters<typeof getLauncherStatus>[0]),
      )) as LauncherStatusRouteResponse;
      if (!res200(response) || !response.data) {
        return null;
      }
      return response.data;
    }, [missingRequiredSettaHome, normalizedSettaHome]);
  const refreshLauncherStatus = useCallback(async () => {
    if (missingRequiredSettaHome) {
      setLauncherStatus(null);
      setLauncherStatusError(missingSettaHomeErrorMessage);
      return;
    }
    setLauncherActionInFlight("refresh");
    setLauncherActionError(null);
    const payload = await fetchLauncherStatus();
    if (!payload) {
      setLauncherStatusError("Failed to load launcher status.");
      setLauncherActionInFlight(null);
      return;
    }
    setLauncherStatus(payload);
    if (!payload.ok) {
      setLauncherStatusError(
        resolveLauncherErrorMessage(payload, "Launcher status request failed."),
      );
      setLauncherActionInFlight(null);
      return;
    }
    setLauncherStatusError(null);
    setLauncherActionInFlight(null);
  }, [
    fetchLauncherStatus,
    missingRequiredSettaHome,
    missingSettaHomeErrorMessage,
  ]);
  useEffect(() => {
    void refreshLauncherStatus();
  }, [refreshLauncherStatus]);
  const {
    launcherInstalled,
    canUpdateInApp,
    installerManagedChannel,
    launcherActionsDisabled,
    launcherSetupButtonLabel,
  } = deriveLauncherControlsState({
    launcherStatus,
    launcherActionInFlight,
  });
  const launcherControlsDisabled =
    launcherActionsDisabled || missingRequiredSettaHome;
  const launcherTarget = formatLauncherTargetCommand(
    launcherStatus?.targetCommand,
  );
  const refreshButtonLabel =
    launcherActionInFlight === "refresh" ? "Refreshing..." : "Refresh";
  const toggleInstallerInstructions = () => {
    setShowInstallerInstructions((value) => !value);
  };
  async function handleLauncherSetup() {
    if (missingRequiredSettaHome) {
      setLauncherActionError(missingSettaHomeErrorMessage);
      return;
    }
    setLauncherActionInFlight("setup");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    setUpdateStage("idle");
    const response = (await callOpenAPI(
      setupLauncher({
        body: buildSetupLauncherRequest(normalizedSettaHome, launcherStatus),
      } as Parameters<typeof setupLauncher>[0]),
    )) as LauncherStatusRouteResponse;
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
    if (missingRequiredSettaHome) {
      setLauncherActionError(missingSettaHomeErrorMessage);
      return;
    }
    setLauncherActionInFlight("repair");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    setUpdateStage("idle");
    const response = (await callOpenAPI(
      repairLauncher({
        body: buildLauncherRequestBase(normalizedSettaHome),
      } as Parameters<typeof repairLauncher>[0]),
    )) as LauncherStatusRouteResponse;
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
    if (missingRequiredSettaHome) {
      setLauncherActionError(missingSettaHomeErrorMessage);
      return;
    }
    setLauncherActionInFlight("remove");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    setUpdateStage("idle");
    const response = (await callOpenAPI(
      removeLauncher({
        body: buildLauncherRequestBase(normalizedSettaHome),
      } as Parameters<typeof removeLauncher>[0]),
    )) as LauncherStatusRouteResponse;
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
    const failLauncherUpdate = (
      errorMessage: string,
      showInstructions = false,
    ) => {
      setUpdateStage("failed");
      setLauncherActionInFlight(null);
      setShowInstallerInstructions(showInstructions);
      setLauncherActionError(errorMessage);
    };
    if (missingRequiredSettaHome) {
      failLauncherUpdate(missingSettaHomeErrorMessage);
      return;
    }
    setLauncherActionInFlight("update");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    setShowInstallerInstructions(false);
    setUpdateStage("checking");
    const currentStatus = await fetchLauncherStatus();
    if (!currentStatus) {
      failLauncherUpdate("Failed to check launcher update capability.");
      return;
    }
    setLauncherStatus(currentStatus);
    const updatePreflight = resolveLauncherUpdatePreflight(currentStatus);
    if (updatePreflight.kind !== "ready") {
      failLauncherUpdate(
        updatePreflight.errorMessage,
        updatePreflight.showInstallerInstructions,
      );
      return;
    }
    setUpdateStage("downloading");
    const response = (await callOpenAPI(
      updateLauncher({
        body: buildUpdateLauncherRequest(normalizedSettaHome),
      } as Parameters<typeof updateLauncher>[0]),
    )) as LauncherUpdateRouteResponse;
    if (!res200(response) || !response.data) {
      failLauncherUpdate("Setta update request failed.");
      return;
    }
    const payload = response.data;
    setLauncherStatus(payload);
    if (!payload.ok) {
      failLauncherUpdate(
        resolveLauncherErrorMessage(payload, "Setta update failed."),
      );
      return;
    }
    setUpdateStage("rebinding");
    applySuccessfulLauncherStatusRefresh({
      launcherStatus: await fetchLauncherStatus(),
      setLauncherStatus,
      setLauncherStatusError,
    });
    const fromVersion = payload.fromVersion ?? "unknown";
    const toVersion = payload.toVersion ?? "unknown";
    setUpdateStage("done");
    setLauncherActionInFlight(null);
    setLauncherActionMessage(`Setta updated: ${fromVersion} -> ${toVersion}`);
  }
  const updateProgressLabel = resolveUpdateProgressLabel(updateStage);
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-setta-50 p-3 dark:border-setta-700 dark:bg-setta-900/50"
      data-testid="desktop-launcher-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400">
          Desktop Launcher
        </span>
        <button
          className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={refreshLauncherStatus}
          disabled={launcherControlsDisabled}
        >
          {refreshButtonLabel}
        </button>
      </div>
      <p className="text-xs text-setta-500 dark:text-setta-400">
        Manage launcher bindings and desktop artifacts from inside Setta.
      </p>
      <LauncherStatusSummary
        launcherStatus={launcherStatus}
        launcherInstalled={launcherInstalled}
        launcherTarget={launcherTarget}
      />
      <LauncherArtifactsPanels launcherStatus={launcherStatus} />
      <LauncherActionButtons
        launcherControlsDisabled={launcherControlsDisabled}
        launcherInstalled={launcherInstalled}
        launcherActionInFlight={launcherActionInFlight}
        launcherSetupButtonLabel={launcherSetupButtonLabel}
        canUpdateInApp={canUpdateInApp}
        installerManagedChannel={installerManagedChannel}
        showInstallerInstructions={showInstallerInstructions}
        onSetup={handleLauncherSetup}
        onRepair={handleLauncherRepair}
        onUpdate={handleLauncherUpdate}
        onRemove={handleLauncherRemove}
        onToggleInstallerInstructions={toggleInstallerInstructions}
      />
      <LauncherFeedbackPanels
        showInstallerInstructions={showInstallerInstructions}
        installerInstructions={installerInstructions}
        updateProgressLabel={updateProgressLabel}
        launcherStatusError={launcherStatusError}
        launcherActionError={launcherActionError}
        launcherActionMessage={launcherActionMessage}
      />
    </section>
  );
}
