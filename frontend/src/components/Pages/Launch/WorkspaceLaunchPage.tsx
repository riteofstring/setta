import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  launchWorkspace,
  type HttpapiLaunchResponse as LaunchResponse,
  type HttpapiWorkspaceLaunchErrorPayload as WorkspaceLaunchErrorPayload,
} from "openapi/http";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HOME_ROUTER_PATH } from "utils/constants";
import { dedupeInFlightJson } from "utils/dedupeInFlight";
import { resolveLauncherBootstrapUrl } from "utils/launcherBootstrapUrl";
import { buildLaunchRequestDedupeKey } from "utils/launchRequestDedupeKey";
import { chooseWorkspaceHistorySettaFilesLocation } from "utils/settaFilesLocation";
import {
  appendWorkspaceHistoryToBootstrapUrlFragment,
  loadWorkspaceHistory,
  upsertWorkspaceHistoryEntry,
} from "utils/workspaceHistory";
import {
  resolveWorkspaceLaunchBackNavigation,
  resolveWorkspaceLaunchReturnUrl,
} from "utils/workspaceLaunchNavigation";
import {
  clearPendingWorkspaceLaunch,
  readPendingWorkspaceLaunch,
  requestOpenWorkspaceSwitcherOnNextMount,
  writeWorkspaceSwitcherDraft,
  type PendingWorkspaceLaunch,
} from "utils/workspaceSwitcherLaunch";
type LaunchReturnUrlTrust = "same-origin-only" | "backend-validated";
type LaunchReturnTarget = {
  returnUrlTrust: LaunchReturnUrlTrust;
  returnUrl: string;
  workspaceRoot: string;
  sshTarget: string | null;
};
type LaunchPhase =
  | {
      status: "idle";
    }
  | ({
      status: "loading";
      startedAt: number;
    } & LaunchReturnTarget)
  | ({
      status: "error";
      message: string;
    } & LaunchReturnTarget);
type LaunchLoadingPhase = Extract<LaunchPhase, { status: "loading" }>;
type LaunchErrorPhase = Extract<LaunchPhase, { status: "error" }>;
type RouteLaunchResult = ResponseDataAndStatus<LaunchResponse>;
type WorkspaceRootResolutionSource = {
  workspaceRoot?: string | null;
  session?: {
    workspacePathCanonical?: string | null;
  } | null;
};
type LaunchExecutionContext = {
  currentHref: string | null;
  launchTarget: LaunchReturnTarget;
  pending: PendingWorkspaceLaunch;
  pendingSettaFilesLocation?: string | null;
};
type LaunchOutcome =
  | {
      kind: "redirect";
      bootstrapUrl: string;
    }
  | {
      kind: "error";
      phase: LaunchErrorPhase;
    };
type LaunchPresentation = {
  details: string;
  errorMessage: string | null;
  isError: boolean;
  returnUrl: string;
  returnUrlTrust: LaunchReturnUrlTrust;
  sshLabel: string | null;
  workspaceLabel: string;
};
const inFlightLaunchesByKey = new Map<string, Promise<RouteLaunchResult>>();
const OUTDATED_PROJECT_SETTINGS_ERROR_CODE = "OutdatedProjectSettings";
const OUTDATED_PROJECT_SETTINGS_ERROR_MESSAGE =
  "This workspace uses an older Setta settings/project format. " +
  "Please migrate the project metadata and try again.";
function normalizeWorkspaceRootCandidate(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function resolveLaunchedWorkspaceRoot(
  response: WorkspaceRootResolutionSource,
  pendingWorkspaceRoot: string | null | undefined,
): string {
  return (
    normalizeWorkspaceRootCandidate(response.session?.workspacePathCanonical) ??
    normalizeWorkspaceRootCandidate(response.workspaceRoot) ??
    normalizeWorkspaceRootCandidate(pendingWorkspaceRoot) ??
    ""
  );
}
function formatElapsedMs(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
}
function resolveWorkspaceLaunchErrorMessage(
  rawError: WorkspaceLaunchErrorPayload | null | undefined,
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
function getCurrentHref(): string | null {
  return typeof window !== "undefined" ? window.location.href : null;
}
function resolveDefaultReturnUrl(currentHref: string | null): string {
  return currentHref
    ? resolveWorkspaceLaunchReturnUrl(null, currentHref)
    : HOME_ROUTER_PATH;
}
function buildLaunchErrorPhase(
  target: LaunchReturnTarget,
  message: string,
): LaunchErrorPhase {
  return {
    status: "error",
    message,
    ...target,
  };
}
function buildLaunchLoadingPhase(
  target: LaunchReturnTarget,
  startedAt: number,
): LaunchLoadingPhase {
  return {
    status: "loading",
    startedAt,
    ...target,
  };
}
function buildMissingPendingLaunchPhase(
  currentHref: string | null,
): LaunchErrorPhase {
  return buildLaunchErrorPhase(
    {
      returnUrlTrust: "same-origin-only",
      returnUrl: resolveDefaultReturnUrl(currentHref),
      workspaceRoot: "",
      sshTarget: null,
    },
    "Missing pending workspace launch request.",
  );
}
function resolvePendingLaunchContext(
  pending: PendingWorkspaceLaunch,
  currentHref: string | null,
): LaunchExecutionContext {
  return {
    currentHref,
    launchTarget: {
      returnUrlTrust: "same-origin-only",
      returnUrl: currentHref
        ? resolveWorkspaceLaunchReturnUrl(
            pending.returnUrl,
            currentHref,
            "same-origin-only",
          )
        : pending.returnUrl,
      workspaceRoot: pending.request.workspaceRoot ?? "",
      sshTarget: pending.sshTarget ?? pending.request.sshTarget ?? null,
    },
    pending,
    pendingSettaFilesLocation:
      pending.settaFilesLocation ?? pending.request.settaFilesLocation,
  };
}
function resolveLaunchTransportErrorOutcome(
  res: RouteLaunchResult,
  launchTarget: LaunchReturnTarget,
): LaunchOutcome {
  const detail = getErrorDetail(res.data);
  const message =
    detail ??
    (res.status
      ? `Launch failed (HTTP ${res.status}). Please try again.`
      : "Launch failed. Please try again.");
  return {
    kind: "error",
    phase: buildLaunchErrorPhase(
      launchTarget,
      resolveWorkspaceLaunchErrorMessage({
        code: null,
        message,
      }),
    ),
  };
}
function resolveResponseReturnTarget(
  response: LaunchResponse,
  pendingReturnUrl: string,
  currentHref: string | null,
): Pick<LaunchReturnTarget, "returnUrl" | "returnUrlTrust"> {
  if (typeof response.returnUrl !== "string") {
    return {
      returnUrlTrust: "same-origin-only",
      returnUrl: pendingReturnUrl,
    };
  }
  return {
    returnUrlTrust: "backend-validated",
    returnUrl: currentHref
      ? resolveWorkspaceLaunchReturnUrl(
          response.returnUrl,
          currentHref,
          "backend-validated",
        )
      : pendingReturnUrl,
  };
}
function parseBootstrapUrlPort(
  bootstrapUrlFragment: string | undefined,
): number | null {
  if (!bootstrapUrlFragment) {
    return null;
  }
  try {
    const parsed = new URL(bootstrapUrlFragment);
    if (!parsed.port) {
      return null;
    }
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }
    return port;
  } catch {
    return null;
  }
}
function resolveHistoryLocalPort(
  pending: PendingWorkspaceLaunch,
  sshTarget: string | null,
  bootstrapUrlFragment: string,
): number | null {
  if (!sshTarget) {
    return null;
  }
  return (
    parseBootstrapUrlPort(bootstrapUrlFragment) ??
    pending.request.localPort ??
    null
  );
}
function persistSuccessfulWorkspaceLaunch(
  context: LaunchExecutionContext,
  response: LaunchResponse & { bootstrapUrlFragment: string },
): string {
  const resolvedWorkspaceRoot = resolveLaunchedWorkspaceRoot(
    response,
    context.pending.request.workspaceRoot,
  );
  const localPort = resolveHistoryLocalPort(
    context.pending,
    context.launchTarget.sshTarget,
    response.bootstrapUrlFragment,
  );
  const historySettaFilesLocation = chooseWorkspaceHistorySettaFilesLocation({
    requested: context.pendingSettaFilesLocation,
    resolved: response.settaFilesLocation,
  });
  const nextEntry = {
    workspaceRoot: resolvedWorkspaceRoot,
    sshTarget: context.launchTarget.sshTarget,
    localPort,
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
    ...context.pending.request,
    workspaceRoot: resolvedWorkspaceRoot,
    sshTarget: context.launchTarget.sshTarget,
    localPort,
    settaFilesLocation: historySettaFilesLocation,
  });
  clearPendingWorkspaceLaunch();
  return resolveLauncherBootstrapUrl(
    appendWorkspaceHistoryToBootstrapUrlFragment(
      response.bootstrapUrlFragment,
      nextHistory,
    ),
  );
}
async function performWorkspaceLaunch(
  context: LaunchExecutionContext,
): Promise<LaunchOutcome> {
  const res = await dedupeInFlightJson(
    inFlightLaunchesByKey,
    context.pending.request,
    async (request) => {
      return await callOpenAPI(
        launchWorkspace({ body: request } as Parameters<
          typeof launchWorkspace
        >[0]),
      );
    },
    buildLaunchRequestDedupeKey,
  );
  if (!res200(res) || !res.data) {
    return resolveLaunchTransportErrorOutcome(res, context.launchTarget);
  }
  const responseTarget = {
    ...context.launchTarget,
    ...resolveResponseReturnTarget(
      res.data,
      context.launchTarget.returnUrl,
      context.currentHref,
    ),
  };
  if (!res.data.ok) {
    return {
      kind: "error",
      phase: buildLaunchErrorPhase(
        responseTarget,
        resolveWorkspaceLaunchErrorMessage({
          code: res.data.error?.code,
          message: res.data.error?.message ?? "Launch failed.",
        }),
      ),
    };
  }
  if (!res.data.bootstrapUrlFragment) {
    return {
      kind: "error",
      phase: buildLaunchErrorPhase(
        responseTarget,
        "Launch succeeded but no bootstrap URL was returned.",
      ),
    };
  }
  return {
    kind: "redirect",
    bootstrapUrl: persistSuccessfulWorkspaceLaunch(context, {
      ...res.data,
      bootstrapUrlFragment: res.data.bootstrapUrlFragment,
    }),
  };
}
function useWorkspaceLaunchPhase(): LaunchPhase {
  const [phase, setPhase] = useState<LaunchPhase>({ status: "idle" });
  useEffect(() => {
    const currentHref = getCurrentHref();
    const pending = readPendingWorkspaceLaunch();
    if (!pending) {
      setPhase(buildMissingPendingLaunchPhase(currentHref));
      return;
    }
    const context = resolvePendingLaunchContext(pending, currentHref);
    let isMounted = true;
    setPhase(
      buildLaunchLoadingPhase(context.launchTarget, pending.requestedAt),
    );
    void performWorkspaceLaunch(context).then((outcome) => {
      if (!isMounted) {
        return;
      }
      if (outcome.kind === "error") {
        setPhase(outcome.phase);
        return;
      }
      window.location.href = outcome.bootstrapUrl;
    });
    return () => {
      isMounted = false;
    };
  }, []);
  return phase;
}
function useLaunchElapsedMs(phase: LaunchPhase): number {
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
  return elapsedMs;
}
function resolveLaunchPresentation(
  phase: LaunchPhase,
  elapsedMs: number,
): LaunchPresentation {
  if (phase.status === "loading") {
    return {
      details: `Launching… (${formatElapsedMs(elapsedMs)})`,
      errorMessage: null,
      isError: false,
      returnUrl: phase.returnUrl,
      returnUrlTrust: phase.returnUrlTrust,
      sshLabel: phase.sshTarget,
      workspaceLabel: phase.workspaceRoot,
    };
  }
  if (phase.status === "error") {
    return {
      details: "Launch failed",
      errorMessage: phase.message,
      isError: true,
      returnUrl: phase.returnUrl,
      returnUrlTrust: phase.returnUrlTrust,
      sshLabel: phase.sshTarget,
      workspaceLabel: phase.workspaceRoot,
    };
  }
  return {
    details: "Launching…",
    errorMessage: null,
    isError: false,
    returnUrl: resolveDefaultReturnUrl(getCurrentHref()),
    returnUrlTrust: "same-origin-only",
    sshLabel: null,
    workspaceLabel: "",
  };
}
function WorkspaceLaunchIndicator({ isError }: { isError: boolean }) {
  if (isError) {
    return (
      <div
        data-testid="workspace-launch-spinner"
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-400/70 bg-red-50 text-lg font-semibold text-red-700 dark:border-red-600/70 dark:bg-red-900/30 dark:text-red-200"
      >
        !
      </div>
    );
  }
  return (
    <div
      data-testid="workspace-launch-spinner"
      className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent"
    />
  );
}
function WorkspaceLaunchContextSummary({
  sshLabel,
  workspaceLabel,
}: {
  sshLabel: string | null;
  workspaceLabel: string;
}) {
  if (!workspaceLabel && !sshLabel) {
    return null;
  }
  return (
    <div className="w-full rounded-xl border border-setta-200 bg-white/40 px-4 py-3 text-left text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-200">
      {workspaceLabel && (
        <p className="truncate">
          <span className="font-semibold">Workspace</span>: {workspaceLabel}
        </p>
      )}
      {sshLabel && (
        <p className="truncate">
          <span className="font-semibold">SSH</span>: {sshLabel}
        </p>
      )}
    </div>
  );
}
export function WorkspaceLaunchPage() {
  const navigate = useNavigate();
  const phase = useWorkspaceLaunchPhase();
  const elapsedMs = useLaunchElapsedMs(phase);
  const presentation = resolveLaunchPresentation(phase, elapsedMs);
  function goBack(returnUrl: string, returnUrlTrust: LaunchReturnUrlTrust) {
    clearPendingWorkspaceLaunch();
    const navigation = resolveWorkspaceLaunchBackNavigation(
      returnUrl,
      window.location.href,
      returnUrlTrust,
    );
    if (navigation.kind === "assign") {
      window.location.assign(navigation.target);
      return;
    }
    requestOpenWorkspaceSwitcherOnNextMount();
    navigate(navigation.target, { replace: true });
  }
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8">
      <section className="flex w-full max-w-[560px] flex-col items-center gap-5 rounded-2xl border border-setta-200 bg-white/70 p-8 text-center shadow-sm backdrop-blur-sm dark:border-setta-700 dark:bg-setta-900/40">
        <WorkspaceLaunchIndicator isError={presentation.isError} />

        <div className="space-y-2">
          <h1 className="text-sm font-semibold uppercase tracking-[0.3em] text-setta-600 dark:text-setta-100">
            Switching Workspace
          </h1>
          <p className="text-xs text-setta-500 dark:text-setta-200">
            {presentation.details}
          </p>
        </div>

        <WorkspaceLaunchContextSummary
          sshLabel={presentation.sshLabel}
          workspaceLabel={presentation.workspaceLabel}
        />

        {presentation.errorMessage && (
          <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
            {presentation.errorMessage}
          </div>
        )}

        <div className="flex w-full flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
          <button
            className="cursor-pointer rounded-full border border-setta-300 px-5 py-2 text-sm text-setta-700 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() =>
              goBack(presentation.returnUrl, presentation.returnUrlTrust)
            }
          >
            Back to Switcher
          </button>
        </div>
      </section>
    </main>
  );
}
