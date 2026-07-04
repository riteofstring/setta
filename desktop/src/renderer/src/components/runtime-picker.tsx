import type { KnownRuntimeView, RuntimeConnectionStatus } from "@shared/types";
import { AlertTriangle, CheckCircle2, Loader2, Monitor, Plus, Server, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { cn } from "../lib/utils";
import { runtimePickerControlsDisabled, useRuntimeStore } from "../stores/runtime-store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function RuntimePicker() {
  const state = useRuntimePickerState();
  return (
    <section className="grid gap-1 px-1" data-testid="runtime-picker">
      <RuntimePickerHeader state={state} />
      <RuntimeList
        busy={state.busy}
        onRemove={(runtimeId) => void state.removeRuntime(runtimeId)}
        onSwitch={(runtimeId) => void state.switchRuntime(runtimeId)}
        runtimes={state.runtimes}
        status={state.status}
      />
      <RuntimePairingForm state={state} />
      <RuntimePickerError error={state.error} />
    </section>
  );
}

function useRuntimePickerState() {
  const addByPairingUrl = useRuntimeStore((state) => state.addByPairingUrl);
  const clearError = useRuntimeStore((state) => state.clearError);
  const error = useRuntimeStore((state) => state.error);
  const operation = useRuntimeStore((state) => state.operation);
  const removeRuntime = useRuntimeStore((state) => state.removeRuntime);
  const snapshot = useRuntimeStore((state) => state.snapshot);
  const status = useRuntimeStore((state) => state.status);
  const switchRuntime = useRuntimeStore((state) => state.switchRuntime);
  const [adding, setAdding] = useState(false);
  const [pairingUrl, setPairingUrl] = useState("");
  const runtimes = snapshot?.runtimes ?? [];
  const activeRuntime = useMemo(
    () => runtimes.find((runtime) => runtime.active) ?? null,
    [runtimes],
  );
  const busy = runtimePickerControlsDisabled(snapshot, operation);
  return {
    activeRuntime,
    addByPairingUrl,
    adding,
    busy,
    clearError,
    error,
    operation,
    pairingUrl,
    removeRuntime,
    runtimes,
    setAdding,
    setPairingUrl,
    status,
    switchRuntime,
  };
}

type RuntimePickerState = ReturnType<typeof useRuntimePickerState>;

function RuntimePickerHeader({ state }: { state: RuntimePickerState }) {
  return (
    <header className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1">
      <RuntimeIcon runtime={state.activeRuntime} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
        {state.activeRuntime?.displayName ?? "Runtime"}
      </span>
      <RuntimeStatusBadge status={state.activeRuntime?.connectionStatus ?? "disconnected"} />
      <button
        aria-label="Add runtime"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        disabled={state.busy}
        onClick={() => {
          state.clearError();
          state.setAdding((current) => !current);
        }}
        title="Add runtime"
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </header>
  );
}

function RuntimePairingForm({ state }: { state: RuntimePickerState }) {
  if (!state.adding) {
    return null;
  }

  async function submitPairingURL(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = state.pairingUrl.trim();
    if (trimmed === "" || state.busy) {
      return;
    }
    await state.addByPairingUrl(trimmed);
    if (useRuntimeStore.getState().error === null) {
      state.setPairingUrl("");
      state.setAdding(false);
    }
  }

  return (
    <form className="grid gap-1 px-1 pt-1" onSubmit={submitPairingURL}>
      <Input
        aria-label="Runtime pairing URL"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setPairingUrl(event.target.value)}
        placeholder="setta://pair?rt=..."
        value={state.pairingUrl}
      />
      <Button
        className="w-fit"
        disabled={state.busy || state.pairingUrl.trim() === ""}
        type="submit"
      >
        {state.operation === "adding" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Add
      </Button>
    </form>
  );
}

function RuntimePickerError({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
  return (
    <p
      className="mx-1 flex min-w-0 items-start gap-1.5 rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1.5 text-xs leading-4 text-destructive"
      data-testid="runtime-picker-error"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{error}</span>
    </p>
  );
}

export function RuntimeList({
  busy,
  onRemove,
  onSwitch,
  runtimes,
  status,
}: {
  busy: boolean;
  onRemove: (runtimeId: string) => void;
  onSwitch: (runtimeId: string) => void;
  runtimes: KnownRuntimeView[];
  status: "idle" | "loading" | "ready" | "error";
}) {
  if (status === "loading" && runtimes.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading runtimes
      </div>
    );
  }
  if (runtimes.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">No runtimes paired</div>;
  }
  return (
    <ul aria-label="Runtimes" className="grid gap-0.5">
      {runtimes.map((runtime) => (
        <li className="group/runtime min-w-0" key={runtime.runtimeId}>
          <article
            className={cn(
              "flex min-w-0 items-center gap-1 rounded-sm px-1 py-1",
              runtime.active && "bg-accent/55",
            )}
          >
            <button
              aria-label={`Switch to ${runtime.displayName}`}
              aria-pressed={runtime.active}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              disabled={busy || runtime.active}
              onClick={() => onSwitch(runtime.runtimeId)}
              type="button"
            >
              <RuntimeIcon runtime={runtime} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-sidebar-foreground">
                  {runtime.displayName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {runtime.baseUrl}
                </span>
              </span>
              <RuntimeDot status={runtime.connectionStatus} />
            </button>
            {!runtime.isLocal ? (
              <button
                aria-label={`Remove ${runtime.displayName}`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover/runtime:opacity-100 disabled:pointer-events-none disabled:opacity-20"
                disabled={busy}
                onClick={() => onRemove(runtime.runtimeId)}
                title={`Remove ${runtime.displayName}`}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </article>
        </li>
      ))}
    </ul>
  );
}

function RuntimeIcon({ runtime }: { runtime: KnownRuntimeView | null }) {
  const Icon = runtime?.isLocal ? Monitor : Server;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function RuntimeStatusBadge({ status }: { status: RuntimeConnectionStatus }) {
  const label = runtimeStatusLabel(status);
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-border bg-card px-1.5 text-[11px] font-medium text-muted-foreground">
      {status === "connected" ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
      ) : status === "connecting" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RuntimeDot status={status} />
      )}
      {label}
    </span>
  );
}

function RuntimeDot({ status }: { status: RuntimeConnectionStatus }) {
  return (
    <span
      aria-label={runtimeStatusLabel(status)}
      className={cn("h-2 w-2 shrink-0 rounded-full", runtimeStatusColor(status))}
      role="status"
    />
  );
}

function runtimeStatusLabel(status: RuntimeConnectionStatus) {
  return (
    {
      connected: "Connected",
      connecting: "Connecting",
      disconnected: "Offline",
      incompatible: "Incompatible",
      mismatched: "Wrong runtime",
      revoked: "Revoked",
      unreachable: "Unreachable",
    } satisfies Record<RuntimeConnectionStatus, string>
  )[status];
}

function runtimeStatusColor(status: RuntimeConnectionStatus) {
  switch (status) {
    case "connected":
      return "bg-emerald-400";
    case "connecting":
      return "bg-sky-400";
    case "disconnected":
      return "bg-zinc-500";
    case "incompatible":
      return "bg-amber-400";
    case "mismatched":
    case "revoked":
    case "unreachable":
      return "bg-destructive";
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported runtime status: ${String(value)}`);
}
