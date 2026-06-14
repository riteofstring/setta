import type {
  CartographerProcessingRunAuditSummary,
  CartographerProcessingState,
  CartographerRun,
} from "@generated/backend";
import { Check, CircleAlert, Loader2 } from "lucide-react";

import type { SemanticCartographerSettingsStatus } from "../stores/semantic-cartographer-settings-store";
import {
  cartographerRunModelText,
  cartographerRunReasoningText,
  formatCartographerBytes,
  formatCartographerDuration,
  shortCartographerHash,
} from "../lib/semantic-cartographer-recording";

export function CartographerRuntimeSummary({
  processingState,
  recentRuns,
}: {
  processingState: CartographerProcessingState | null;
  recentRuns: CartographerRun[];
}) {
  return (
    <section className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5">
      <h3 className="text-xs font-semibold text-foreground">Runtime</h3>
      {processingState ? (
        <div className="grid gap-2">
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <RuntimeMetric
              label="Settings hash"
              value={shortCartographerHash(processingState.settingsHash)}
            />
            <RuntimeMetric
              label="Effective concurrency"
              value={`${processingState.effectiveProcessingConfig.maxConcurrent}/${processingState.effectiveProcessingConfig.perSourceConcurrent}`}
            />
            <RuntimeMetric
              label="Queue"
              value={`${processingState.queuedWindowCount} queued, ${processingState.runningWindowCount} running`}
            />
            <RuntimeMetric
              label="Durable"
              value={`${processingState.durableQueuedWindowCount} queued, ${processingState.durableRunningWindowCount} running`}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <ProcessingRunSummary
              label="Last processed"
              summary={processingState.lastProcessedRunSummary}
            />
            <ProcessingRunSummary
              label="Last failure"
              summary={processingState.lastFailureRunSummary}
            />
          </div>
          <RecentRuns runs={recentRuns} />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Waiting for cartographer runtime state</div>
      )}
    </section>
  );
}

export function CartographerSettingsStatus({
  dirty,
  error,
  fieldErrors,
  status,
  workspaceReady,
}: {
  dirty: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  status: SemanticCartographerSettingsStatus;
  workspaceReady: boolean;
}) {
  if (error) {
    return <StatusAlert message={error} />;
  }
  if (!workspaceReady) {
    return <StatusAlert message="Open a workspace to validate and save cartographer settings." />;
  }
  const errorCount = Object.keys(fieldErrors).length;
  if (errorCount > 0) {
    return <StatusAlert message={`${errorCount} cartographer setting needs attention.`} />;
  }
  if (status === "saving") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving cartographer settings
      </div>
    );
  }
  if (dirty) {
    return <div className="text-xs text-muted-foreground">Unsaved cartographer changes</div>;
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Cartographer settings saved
      </div>
    );
  }
  return null;
}

function RecentRuns({ runs }: { runs: CartographerRun[] }) {
  if (runs.length === 0) {
    return <div className="text-xs text-muted-foreground">No recent cartographer runs</div>;
  }
  return (
    <div className="grid gap-1">
      {runs.map((run) => (
        <div
          className="grid gap-1 rounded-sm border border-border/70 px-2 py-1.5 text-xs md:grid-cols-[7rem_6rem_minmax(0,1fr)_6rem_6rem]"
          key={run.id}
        >
          <span className="truncate font-medium text-foreground">{run.status}</span>
          <span className="truncate text-muted-foreground">{run.taskProfile}</span>
          <span className="truncate text-muted-foreground">
            {cartographerRunModelText(run)} / {cartographerRunReasoningText(run)}
          </span>
          <span className="truncate text-muted-foreground">
            {formatCartographerDuration(run.totalDurationMs)}
          </span>
          <span className="truncate text-muted-foreground">
            {formatCartographerBytes(run.inputBundleBytes)}
          </span>
          {run.error ? (
            <span className="break-words text-status-critical md:col-span-5">{run.error}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProcessingRunSummary({
  label,
  summary,
}: {
  label: string;
  summary: CartographerProcessingRunAuditSummary | null;
}) {
  if (!summary) {
    return (
      <div className="rounded-sm border border-border/70 px-2 py-1.5 text-xs text-muted-foreground">
        {label}: none
      </div>
    );
  }
  return (
    <div className="grid gap-1 rounded-sm border border-border/70 px-2 py-1.5 text-xs">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="font-medium text-foreground">{label}</span>
        <span className="truncate text-muted-foreground">{summary.status}</span>
      </div>
      <div className="truncate text-muted-foreground">
        {summary.taskProfile} / {cartographerRunModelText(summary)} /{" "}
        {cartographerRunReasoningText(summary)}
      </div>
      <div className="truncate text-muted-foreground">
        {formatCartographerDuration(summary.totalDurationMs)} /{" "}
        {formatCartographerBytes(summary.inputBundleBytes)}
      </div>
      {summary.error ? (
        <div className="break-words text-status-critical">{summary.error}</div>
      ) : null}
    </div>
  );
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-border/70 px-2 py-1.5">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function StatusAlert({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-sm border border-status-critical bg-status-critical/15 px-2 py-1.5 text-xs text-status-critical">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}
