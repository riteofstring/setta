import { useEffect, useMemo, useState } from "react";

import { res200 } from "utils/endpointUtils";
import {
  route_get_launcher_status,
  route_remove_launcher,
  route_repair_launcher,
  route_setup_launcher,
  route_update_launcher,
} from "utils/generatedEndpoints";
import {
  type LauncherRequestBaseInput,
  type LauncherStatusResponse,
  type LauncherUpdateResponse,
  type SetupLauncherRequestInput,
  type UpdateLauncherRequestInput,
} from "utils/generatedTypes";

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

type DesktopLauncherSettingsSectionProps = {
  settaHome?: string | null;
};

function buildLauncherRequestBase(
  settaHome: string | null,
): LauncherRequestBaseInput {
  return { settaHome };
}

function buildSetupLauncherRequest(
  settaHome: string | null,
): SetupLauncherRequestInput {
  return { settaHome };
}

function buildUpdateLauncherRequest(
  settaHome: string | null,
): UpdateLauncherRequestInput {
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

export function resolveInstallerInstructionsForUserAgent(
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

export function deriveLauncherControlsState({
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

export function resolveUpdateProgressLabel(
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

export function DesktopLauncherSettingsSection({
  settaHome = null,
}: DesktopLauncherSettingsSectionProps) {
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

  async function fetchLauncherStatus(): Promise<LauncherStatusResponse | null> {
    const response = await route_get_launcher_status(settaHome);
    if (!res200(response) || !response.data) {
      return null;
    }
    return response.data;
  }

  async function refreshLauncherStatus() {
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
  }

  useEffect(() => {
    void refreshLauncherStatus();
  }, []);

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
  const launcherTarget = formatLauncherTargetCommand(
    launcherStatus?.targetCommand,
  );

  async function handleLauncherSetup() {
    setLauncherActionInFlight("setup");
    setLauncherActionError(null);
    setLauncherActionMessage(null);
    setUpdateStage("idle");
    const response = await route_setup_launcher(
      buildSetupLauncherRequest(settaHome),
    );
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
    setUpdateStage("idle");
    const response = await route_repair_launcher(
      buildLauncherRequestBase(settaHome),
    );
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
    setUpdateStage("idle");
    const response = await route_remove_launcher(
      buildLauncherRequestBase(settaHome),
    );
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
    setShowInstallerInstructions(false);

    setUpdateStage("checking");
    const currentStatus = await fetchLauncherStatus();
    if (!currentStatus) {
      setUpdateStage("failed");
      setLauncherActionInFlight(null);
      setLauncherActionError("Failed to check launcher update capability.");
      return;
    }
    setLauncherStatus(currentStatus);
    if (!currentStatus.ok) {
      setUpdateStage("failed");
      setLauncherActionInFlight(null);
      setLauncherActionError(
        resolveLauncherErrorMessage(
          currentStatus,
          "Launcher update capability check failed.",
        ),
      );
      return;
    }
    if (currentStatus.updateCapability !== "in_app") {
      setUpdateStage("failed");
      setLauncherActionInFlight(null);
      if (currentStatus.updateCapability === "installer_managed") {
        setShowInstallerInstructions(true);
      }
      setLauncherActionError(
        currentStatus.updateGuidance ??
          "In-app launcher update is unavailable.",
      );
      return;
    }

    setUpdateStage("downloading");
    const response = await route_update_launcher(
      buildUpdateLauncherRequest(settaHome),
    );
    if (!res200(response) || !response.data) {
      setUpdateStage("failed");
      setLauncherActionInFlight(null);
      setLauncherActionError("Setta update request failed.");
      return;
    }

    const payload = response.data;
    setLauncherStatus(payload);
    if (!payload.ok) {
      setUpdateStage("failed");
      setLauncherActionInFlight(null);
      setLauncherActionError(
        resolveLauncherErrorMessage(payload, "Setta update failed."),
      );
      return;
    }

    setUpdateStage("rebinding");
    const refreshedStatus = await fetchLauncherStatus();
    if (refreshedStatus && refreshedStatus.ok) {
      setLauncherStatus(refreshedStatus);
      setLauncherStatusError(null);
    }

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
          disabled={launcherActionsDisabled}
        >
          {launcherActionInFlight === "refresh" ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-setta-500 dark:text-setta-400">
        Manage launcher bindings and desktop artifacts from inside Setta.
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
      )}
      {launcherStatus?.managedArtifacts &&
        Object.keys(launcherStatus.managedArtifacts).length > 0 && (
          <div className="rounded-md border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-800 dark:text-setta-200">
            <p className="font-semibold">Managed artifacts</p>
            <ul className="mt-1 list-disc pl-4">
              {Object.entries(launcherStatus.managedArtifacts).map(
                ([name, path]) => (
                  <li key={name} className="break-all">
                    <span className="font-semibold">{name}</span>: {path}
                  </li>
                ),
              )}
            </ul>
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
        {canUpdateInApp && (
          <button
            className="rounded-full border border-setta-300 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={handleLauncherUpdate}
            disabled={launcherActionsDisabled}
          >
            {launcherActionInFlight === "update"
              ? "Updating..."
              : "Update Setta"}
          </button>
        )}
        {installerManagedChannel && (
          <button
            className="rounded-full border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
            onClick={() => {
              setShowInstallerInstructions((value) => !value);
            }}
            disabled={launcherActionsDisabled}
          >
            {showInstallerInstructions
              ? "Hide Update Instructions"
              : "Show Update Instructions"}
          </button>
        )}
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
    </section>
  );
}
