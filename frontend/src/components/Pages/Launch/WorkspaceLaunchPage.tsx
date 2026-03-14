import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HOME_ROUTER_PATH } from "utils/constants";
import { dedupeInFlightJson } from "utils/dedupeInFlight";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import { route_launch } from "utils/generatedEndpoints";
import { resolveLauncherBootstrapUrl } from "utils/launcherBootstrapUrl";
import { buildLaunchRequestDedupeKey } from "utils/launchRequestDedupeKey";
import { chooseWorkspaceHistorySettaFilesLocation } from "utils/settaFilesLocation";
import type { LaunchErrorPayload, LaunchResponse } from "utils/generatedTypes";
import {
  resolveWorkspaceLaunchBackNavigation,
  resolveWorkspaceLaunchReturnUrl,
} from "utils/workspaceLaunchNavigation";
import {
  appendWorkspaceHistoryToBootstrapUrlFragment,
  loadWorkspaceHistory,
  upsertWorkspaceHistoryEntry,
} from "utils/workspaceHistory";
import {
  clearPendingWorkspaceLaunch,
  readPendingWorkspaceLaunch,
  requestOpenWorkspaceSwitcherOnNextMount,
  writeWorkspaceSwitcherDraft,
} from "utils/workspaceSwitcherLaunch";

type LaunchPhase =
  | { status: "idle" }
  | {
      status: "loading";
      startedAt: number;
      returnUrl: string;
      workspaceRoot: string;
      sshTarget: string | null;
    }
  | {
      status: "error";
      message: string;
      returnUrl: string;
      workspaceRoot: string;
      sshTarget: string | null;
    };

type RouteLaunchResult = ResponseDataAndStatus<LaunchResponse>;

const inFlightLaunchesByKey = new Map<string, Promise<RouteLaunchResult>>();
const OUTDATED_PROJECT_SETTINGS_ERROR_CODE = "OutdatedProjectSettings";
const OUTDATED_PROJECT_SETTINGS_ERROR_MESSAGE =
  "This workspace uses an older Setta settings/project format. " +
  "Please migrate the project metadata and try again.";

function formatElapsedMs(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
}

export function resolveWorkspaceLaunchErrorMessage(
  rawError: LaunchErrorPayload | null | undefined,
): string {
  if (rawError?.code === OUTDATED_PROJECT_SETTINGS_ERROR_CODE) {
    return OUTDATED_PROJECT_SETTINGS_ERROR_MESSAGE;
  }
  const rawMessage = rawError?.message;
  if (!rawMessage || !rawMessage.trim()) {
    return "Launch failed.";
  }
  return rawMessage.trim();
}

export function WorkspaceLaunchPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LaunchPhase>({ status: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAt = phase.status === "loading" ? phase.startedAt : null;
  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    setElapsedMs(Date.now() - startedAt);
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => {
      clearInterval(intervalId);
    };
  }, [startedAt]);

  useEffect(() => {
    const pending = readPendingWorkspaceLaunch();
    const defaultReturnUrl =
      typeof window !== "undefined"
        ? resolveWorkspaceLaunchReturnUrl(null, window.location.href)
        : HOME_ROUTER_PATH;
    if (!pending) {
      setPhase({
        status: "error",
        message: "Missing pending workspace launch request.",
        returnUrl: defaultReturnUrl,
        workspaceRoot: "",
        sshTarget: null,
      });
      return;
    }
    const pendingReturnUrl =
      typeof window !== "undefined"
        ? resolveWorkspaceLaunchReturnUrl(
            pending.returnUrl,
            window.location.href,
          )
        : pending.returnUrl;
    const pendingSshTarget =
      pending.sshTarget ?? pending.request.sshTarget ?? null;
    const pendingSettaFilesLocation =
      pending.settaFilesLocation ?? pending.request.settaFilesLocation;

    let isMounted = true;
    setPhase({
      status: "loading",
      startedAt: pending.requestedAt,
      returnUrl: pendingReturnUrl,
      workspaceRoot: pending.request.workspaceRoot ?? "",
      sshTarget: pendingSshTarget,
    });

    async function runLaunch() {
      const res = await dedupeInFlightJson(
        inFlightLaunchesByKey,
        pending.request,
        route_launch,
        buildLaunchRequestDedupeKey,
      );
      if (!isMounted) {
        return;
      }
      if (!res200(res) || !res.data) {
        const detail = getErrorDetail(res.data);
        setPhase({
          status: "error",
          message: resolveWorkspaceLaunchErrorMessage({
            code: null,
            message:
              detail ??
              (res.status
                ? `Launch failed (HTTP ${res.status}). Please try again.`
                : "Launch failed. Please try again."),
          }),
          returnUrl: pendingReturnUrl,
          workspaceRoot: pending.request.workspaceRoot ?? "",
          sshTarget: pendingSshTarget,
        });
        return;
      }
      const responseReturnUrl =
        typeof window !== "undefined"
          ? resolveWorkspaceLaunchReturnUrl(
              res.data.returnUrl ?? pendingReturnUrl,
              window.location.href,
            )
          : pendingReturnUrl;
      if (!res.data.ok) {
        setPhase({
          status: "error",
          message: resolveWorkspaceLaunchErrorMessage({
            code: res.data.error?.code,
            message: res.data.error?.message ?? "Launch failed.",
          }),
          returnUrl: responseReturnUrl,
          workspaceRoot: pending.request.workspaceRoot ?? "",
          sshTarget: pendingSshTarget,
        });
        return;
      }
      if (!res.data.bootstrapUrlFragment) {
        setPhase({
          status: "error",
          message: "Launch succeeded but no bootstrap URL was returned.",
          returnUrl: responseReturnUrl,
          workspaceRoot: pending.request.workspaceRoot ?? "",
          sshTarget: pendingSshTarget,
        });
        return;
      }

      const resolvedWorkspaceRoot =
        res.data.workspaceRoot ?? pending.request.workspaceRoot ?? "";
      let resolvedLocalPort = pending.request.localPort ?? null;
      if (pendingSshTarget) {
        try {
          const url = new URL(res.data.bootstrapUrlFragment);
          if (url.port) {
            const port = Number(url.port);
            if (
              Number.isFinite(port) &&
              Number.isInteger(port) &&
              port >= 1 &&
              port <= 65535
            ) {
              resolvedLocalPort = port;
            }
          }
        } catch {
          // Keep the requested local port when URL parsing fails.
        }
      } else {
        resolvedLocalPort = null;
      }

      const historySettaFilesLocation =
        chooseWorkspaceHistorySettaFilesLocation({
          requested: pendingSettaFilesLocation,
          resolved: res.data.settaFilesLocation,
        });

      const nextEntry = {
        workspaceRoot: resolvedWorkspaceRoot,
        sshTarget: pendingSshTarget,
        localPort: resolvedLocalPort,
        settaFilesLocation: historySettaFilesLocation,
        lastUsedAt: Date.now(),
      };

      const nextHistory = upsertWorkspaceHistoryEntry(
        loadWorkspaceHistory(),
        nextEntry,
      );

      // Keep the switcher selection aligned with what actually happened, so
      // reopening the modal doesn't show a misleading explicit selection.
      writeWorkspaceSwitcherDraft({
        ...pending.request,
        workspaceRoot: resolvedWorkspaceRoot,
        sshTarget: pendingSshTarget,
        localPort: resolvedLocalPort,
        settaFilesLocation: historySettaFilesLocation,
      });

      clearPendingWorkspaceLaunch();
      const bootstrapUrl = resolveLauncherBootstrapUrl(
        appendWorkspaceHistoryToBootstrapUrlFragment(
          res.data.bootstrapUrlFragment,
          nextHistory,
        ),
      );
      window.location.href = bootstrapUrl;
    }

    void runLaunch();

    return () => {
      isMounted = false;
    };
  }, []);

  const details = useMemo(() => {
    if (phase.status === "idle") {
      return null;
    }
    if (phase.status === "loading") {
      return `Launching… (${formatElapsedMs(elapsedMs)})`;
    }
    return "Launch failed";
  }, [elapsedMs, phase.status]);

  function goBack(returnUrl: string) {
    clearPendingWorkspaceLaunch();
    const navigation = resolveWorkspaceLaunchBackNavigation(
      returnUrl,
      window.location.href,
    );
    if (navigation.kind === "assign") {
      window.location.assign(navigation.target);
      return;
    }
    requestOpenWorkspaceSwitcherOnNextMount();
    navigate(navigation.target, { replace: true });
  }

  const errorMessage = phase.status === "error" ? phase.message : null;
  const returnUrl =
    phase.status === "loading" || phase.status === "error"
      ? phase.returnUrl
      : typeof window !== "undefined"
        ? new URL(HOME_ROUTER_PATH, window.location.href).toString()
        : HOME_ROUTER_PATH;
  const workspaceLabel =
    phase.status === "loading" || phase.status === "error"
      ? phase.workspaceRoot
      : "";
  const sshLabel =
    phase.status === "loading" || phase.status === "error"
      ? phase.sshTarget
      : null;

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8">
      <section className="flex w-full max-w-[560px] flex-col items-center gap-5 rounded-2xl border border-setta-200 bg-white/70 p-8 text-center shadow-sm backdrop-blur-sm dark:border-setta-700 dark:bg-setta-900/40">
        {phase.status === "error" ? (
          <div
            data-testid="workspace-launch-spinner"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-400/70 bg-red-50 text-lg font-semibold text-red-700 dark:border-red-600/70 dark:bg-red-900/30 dark:text-red-200"
          >
            !
          </div>
        ) : (
          <div
            data-testid="workspace-launch-spinner"
            className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent"
          />
        )}

        <div className="space-y-2">
          <h1 className="text-sm font-semibold uppercase tracking-[0.3em] text-setta-600 dark:text-setta-100">
            Switching Workspace
          </h1>
          <p className="text-xs text-setta-500 dark:text-setta-200">
            {details ?? "Launching…"}
          </p>
        </div>

        {(workspaceLabel || sshLabel) && (
          <div className="w-full rounded-xl border border-setta-200 bg-white/40 px-4 py-3 text-left text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-200">
            {workspaceLabel && (
              <p className="truncate">
                <span className="font-semibold">Workspace</span>:{" "}
                {workspaceLabel}
              </p>
            )}
            {sshLabel && (
              <p className="truncate">
                <span className="font-semibold">SSH</span>: {sshLabel}
              </p>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="flex w-full flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
          <button
            className="cursor-pointer rounded-full border border-setta-300 px-5 py-2 text-sm text-setta-700 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() => goBack(returnUrl)}
          >
            Back to Switcher
          </button>
        </div>
      </section>
    </main>
  );
}
