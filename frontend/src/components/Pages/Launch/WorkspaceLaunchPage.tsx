import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_launch } from "utils/generatedEndpoints";
import type { LaunchResponse } from "utils/generatedTypes";
import {
  loadWorkspaceHistory,
  upsertWorkspaceHistoryEntry,
  writeWorkspaceHistoryToWindowName,
} from "utils/workspaceHistory";
import {
  clearPendingWorkspaceLaunch,
  readPendingWorkspaceLaunch,
  requestOpenWorkspaceSwitcherOnNextMount,
} from "utils/workspaceSwitcherLaunch";
import { HOME_ROUTER_PATH } from "utils/constants";

type LaunchPhase =
  | { status: "idle" }
  | {
      status: "loading";
      startedAt: number;
      returnPath: string;
      workspaceRoot: string;
      sshTarget: string | null;
    }
  | {
      status: "error";
      message: string;
      returnPath: string;
      workspaceRoot: string;
      sshTarget: string | null;
    }
  | { status: "success"; response: LaunchResponse };

function formatElapsedMs(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
}

export function WorkspaceLaunchPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LaunchPhase>({ status: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const pending = readPendingWorkspaceLaunch();
    if (!pending) {
      setPhase({
        status: "error",
        message: "Missing pending workspace launch request.",
        returnPath: HOME_ROUTER_PATH,
        workspaceRoot: "",
        sshTarget: null,
      });
      return;
    }

    let isMounted = true;
    setPhase({
      status: "loading",
      startedAt: pending.requestedAt,
      returnPath: pending.returnPath,
      workspaceRoot: pending.request.workspaceRoot ?? "",
      sshTarget: pending.request.sshTarget ?? null,
    });

    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - pending.requestedAt);
    }, 250);

    async function runLaunch() {
      const res = await route_launch(pending.request);
      if (!isMounted) {
        return;
      }
      if (!res200(res) || !res.data) {
        const detail = getErrorDetail(res.data);
        setPhase({
          status: "error",
          message:
            detail ??
            (res.status
              ? `Launch failed (HTTP ${res.status}). Please try again.`
              : "Launch failed. Please try again."),
          returnPath: pending.returnPath,
          workspaceRoot: pending.request.workspaceRoot ?? "",
          sshTarget: pending.request.sshTarget ?? null,
        });
        return;
      }
      if (!res.data.ok) {
        setPhase({
          status: "error",
          message: res.data.error?.message ?? "Launch failed.",
          returnPath: pending.returnPath,
          workspaceRoot: pending.request.workspaceRoot ?? "",
          sshTarget: pending.request.sshTarget ?? null,
        });
        return;
      }
      if (!res.data.bootstrapUrlFragment) {
        setPhase({
          status: "error",
          message: "Launch succeeded but no bootstrap URL was returned.",
          returnPath: pending.returnPath,
          workspaceRoot: pending.request.workspaceRoot ?? "",
          sshTarget: pending.request.sshTarget ?? null,
        });
        return;
      }

      const nextEntry = {
        workspaceRoot: pending.request.workspaceRoot ?? "",
        sshTarget: pending.request.sshTarget ?? null,
        sshArgs: pending.request.sshArgs ?? null,
        remoteCmd: pending.request.remoteCmd ?? null,
        localPort: pending.request.localPort ?? null,
        filesRoot: res.data.filesRoot ?? pending.request.filesRoot ?? null,
        filesRootBase: pending.request.filesRootBase ?? null,
        lastUsedAt: Date.now(),
      };

      const nextHistory = upsertWorkspaceHistoryEntry(
        loadWorkspaceHistory(),
        nextEntry,
      );
      writeWorkspaceHistoryToWindowName(nextHistory);

      clearPendingWorkspaceLaunch();
      window.location.href = res.data.bootstrapUrlFragment;
      setPhase({ status: "success", response: res.data });
    }

    const launchTimeoutId = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }
      void runLaunch();
    }, 0);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      clearTimeout(launchTimeoutId);
    };
  }, []);

  const details = useMemo(() => {
    if (phase.status === "idle") {
      return null;
    }
    if (phase.status === "loading") {
      return `Launching… (${formatElapsedMs(elapsedMs)})`;
    }
    if (phase.status === "success") {
      return "Redirecting…";
    }
    return "Launch failed";
  }, [elapsedMs, phase.status]);

  function goBack(returnPath: string) {
    clearPendingWorkspaceLaunch();
    requestOpenWorkspaceSwitcherOnNextMount();
    navigate(returnPath, { replace: true });
  }

  const errorMessage = phase.status === "error" ? phase.message : null;
  const returnPath =
    phase.status === "loading" || phase.status === "error"
      ? phase.returnPath
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
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />

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
            onClick={() => goBack(returnPath)}
          >
            Back to Switcher
          </button>
          {phase.status === "error" && (
            <button
              className="cursor-pointer rounded-full bg-setta-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 dark:hover:bg-blue-700"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
